/**
 * First-run Setup (ADR 0012).
 *
 * A fresh deployment has no Business, no User and therefore nothing to sign in
 * to, so this is the one unauthenticated write in the product. Every decision
 * that makes it safe is in ADR 0012; the code here is that decision with line
 * numbers:
 *
 * - the token comes from the host's environment and is compared constant-time,
 *   so a timing side-channel cannot cheapen it into a guessable key;
 * - the count guard is a count under an advisory transaction lock, *inside* the
 *   same transaction that inserts the first Business, so two simultaneous
 *   visitors cannot both win and a restored backup that already holds a Business
 *   leaves Setup closed with no manual step;
 * - everything that must exist for a first invoice is created in that one
 *   transaction — Business, first Administrator, a Number pattern for every
 *   Document type, at least one Unit, at least one Tax Rate when the regime is
 *   STANDARD — and a request that fails partway leaves nothing behind;
 * - one Audit Entry is written with a null actor and the caller's address: the
 *   one legitimate event in the trail with no actor, and the only one.
 */

import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  DOCUMENT_TYPES,
  MODULES,
  PARTY_ROLES,
  setupRequestSchema,
  setupStatusSchema,
  type SetupRequest,
  type SetupResult,
  type SetupStatus,
} from '@easyerp/contracts';

import { AuditService } from '../audit/audit.service.js';
import { DomainError, conflict, invariant, validationFailed } from '../common/errors.js';
import { env } from '../config/env.js';
import { Prisma } from '../generated/prisma/index.js';
import { ADMINISTRATOR_ROLE_CODE } from '../identity/roles.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DEFAULT_PATTERNS } from '../numbering/document-numbering.service.js';

/**
 * The default Number pattern for each Document type (ADR 0006). The single
 * source of these defaults is `DEFAULT_PATTERNS` in the numbering service;
 * Setup writes a row for every type so a Business never depends on a fallback
 * that lives in application code, and an Administrator changes the rows
 * afterwards in Settings.
 */
const DEFAULT_NUMBER_PATTERNS = DEFAULT_PATTERNS;

@Injectable()
export class SetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getStatus(): Promise<SetupStatus> {
    // A count, not a flag: a restored backup that already holds a Business leaves
    // Setup closed with no manual step (ADR 0012). `Business` is the single tenant
    // row, so "is there any" is the whole check and needs no where clause.
    const businesses = await this.prisma.business.count();
    return setupStatusSchema.parse({ needsSetup: businesses === 0 });
  }

  async complete(payload: unknown, ipAddress?: string | null): Promise<SetupResult> {
    // `.parse`, not `.safeParse`: the schema is a `strictObject`, so a malformed
    // request fails with the field named, the same way the invoice flow does.
    const input = setupRequestSchema.parse(payload);

    this.assertToken(input.token);

    if (input.business.vatRegime === 'STANDARD' && input.taxRates.length === 0) {
      throw validationFailed(
        'A STANDARD Business needs at least one Tax Rate, or its first invoice has nothing to print a breakdown from.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Serialise Setup itself: whichever visitor enters first inserts the
      // Business; the other waits here, then re-reads the count and is refused.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('easyerp:setup:provision')::bigint)`;

      if ((await tx.business.count()) > 0) {
        // The same count the guard is — the distinction from the lock above is
        // that this one is inside the transaction, so it sees committed truth.
        throw new DomainError('NOT_FOUND', 'Setup is already complete');
      }

      await this.assertFreshCodes(tx, input);

      const business = await tx.business.create({
        data: {
          legalName: input.business.legalName,
          displayName: input.business.displayName,
          taxIdentifier: input.business.taxIdentifier,
          countryCode: input.business.countryCode,
          vatRegime: input.business.vatRegime,
          currency: input.business.currency,
          phone: input.business.phone ?? null,
          email: input.business.email ?? null,
          addressLine1: input.business.addressLine1 ?? null,
          addressLine2: input.business.addressLine2 ?? null,
          city: input.business.city ?? null,
          postalCode: input.business.postalCode ?? null,
        },
      });

      for (const unit of input.units) {
        await tx.unit.create({ data: { code: unit.code, allowsFraction: unit.allowsFraction } });
      }

      for (const taxRate of input.taxRates) {
        await tx.taxRate.create({
          data: { code: taxRate.code, rate: taxRate.rate, isStandard: true },
        });
      }

      for (const code of DOCUMENT_TYPES) {
        await tx.numberPattern.create({
          data: { code, pattern: DEFAULT_NUMBER_PATTERNS[code], padding: 4 },
        });
      }

      // Module enablement from Setup; defaults to all enabled except PRODUCTION
      // (and BOM via production) for a lean start per grill Q8. Explicit so a
      // fresh deployment's state matches the DB, not an absent-row implication.
      const defaultModules: Record<(typeof MODULES)[number], boolean> = {
        SALES: true,
        PURCHASING: true,
        INVENTORY: true,
        FINANCE: true,
        PRODUCTION: false,
      };
      const modulesToWrite = (input.modules as Record<string, boolean> | undefined) ?? defaultModules;
      for (const module of MODULES) {
        const isEnabled = modulesToWrite[module] ?? (module === 'PRODUCTION' ? false : true);
        await tx.moduleState.create({ data: { module, isEnabled } });
      }

      const { hashPassword } = await import('better-auth/crypto');
      const administratorId = randomUUID();
      await tx.authUser.create({
        data: {
          id: administratorId,
          email: input.administrator.email,
          name: input.administrator.name,
          emailVerified: true,
          isActive: true,
        },
      });
      await tx.authAccount.create({
        data: {
          id: randomUUID(),
          userId: administratorId,
          providerId: 'credential',
          accountId: administratorId,
          password: await hashPassword(input.administrator.password),
        },
      });

      const role = await tx.role.findUnique({ where: { code: ADMINISTRATOR_ROLE_CODE } });
      invariant(role, 'Administrator role must exist (ensureAdministrator runs at boot)');
      await tx.userRole.create({ data: { userId: administratorId, roleId: role.id } });

      await this.audit.record(
        tx,
        {
          action: 'setup.completed',
          entityType: 'SETUP',
          entityId: business.id,
          after: {
            businessId: business.id,
            administratorEmail: input.administrator.email,
            vatRegime: input.business.vatRegime,
          },
        },
        { id: null, email: null, ipAddress: ipAddress ?? null },
      );

      // Create an Internal Party for production orders and other internal operations.
      // This Party has the SUPPLIER role and is used as the partyId on production
      // orders (which consume components and produce finished goods internally).
      await tx.party.create({
        data: {
          code: 'INTERNAL',
          name: 'Internal Operations',
          roles: [PARTY_ROLES[1]], // SUPPLIER
          isActive: true,
        },
      });

      return { businessId: business.id, administratorEmail: input.administrator.email };
    });
  }

  /**
   * Constant-time token check. Equal-length SHA-256 digests feed
   * `timingSafeEqual`, so the comparison time does not depend on how many bytes
   * of a guess were right.
   */
  private assertToken(provided: string): void {
    const expected = env().FIRST_SETUP_TOKEN;
    const a = createHash('sha256').update(provided).digest();
    const b = createHash('sha256').update(expected).digest();
    if (!timingSafeEqual(a, b)) {
      throw new DomainError('FORBIDDEN', 'The first-run setup token is invalid');
    }
  }

  /**
   * Codes entered at Setup must be unique both within the request and against
   * the database, because `unit.code` and `tax_rate.code` are global identities
   * (single-tenant schema, ADR 0003). A raw unique-constraint failure would roll
   * the transaction back correctly but surface as a 500; this hands the operator
   * the name of the offending code instead.
   */
  private async assertFreshCodes(tx: Prisma.TransactionClient, input: SetupRequest): Promise<void> {
    const duplicate = (codes: readonly string[]): string | undefined =>
      [...new Set(codes)].find(
        (code) => codes.filter((candidate) => candidate === code).length > 1,
      );

    const unitCodes = input.units.map((unit) => unit.code);
    const dupUnit = duplicate(unitCodes);
    if (dupUnit) throw conflict(`Duplicate Unit code in the request: ${dupUnit}`);

    const rateCodes = input.taxRates.map((rate) => rate.code);
    const dupRate = duplicate(rateCodes);
    if (dupRate) throw conflict(`Duplicate Tax Rate code in the request: ${dupRate}`);

    if (unitCodes.length > 0) {
      const existingUnits = await tx.unit.findMany({ where: { code: { in: unitCodes } } });
      if (existingUnits.length > 0) {
        throw conflict('A Unit with this code already exists', {
          codes: existingUnits.map((unit) => unit.code),
        });
      }
    }

    if (rateCodes.length > 0) {
      const existingRates = await tx.taxRate.findMany({ where: { code: { in: rateCodes } } });
      if (existingRates.length > 0) {
        throw conflict('A Tax Rate with this code already exists', {
          codes: existingRates.map((rate) => rate.code),
        });
      }
    }
  }
}
