/**
 * Parties (spec 001 stories 28–32).
 *
 * One composite record holds both commercial roles (story 29) — a Business that
 * buys from its own customers keeps one row, not two. Parties are retired, never
 * deleted (the same rule as Items): a document that quotes a name keeps that
 * name resolving after the counterparty stops trading with us.
 *
 * Commercial terms (story 30) belong to the CUSTOMER role. A supplier-only Party
 * has none; the instant a Party loses the CUSTOMER role its terms are cleared,
 * because terms are a fact about the debts we hold, not about the counterparty.
 * A client cannot therefore stash terms on a supplier record and have them
 * silently ignored — the rule is refused aloud, which is the difference between
 * a rule and a coincidence.
 */

import { Injectable } from '@nestjs/common';

import {
  partyInputSchema,
  partyListQuerySchema,
  partySchema,
  type Party,
  type PartyInput,
  type PageQuery,
} from '@easyerp/contracts';

import { AuditService } from '../audit/audit.service.js';
import { conflict, notFound, validationFailed } from '../common/errors.js';
import type { Paged } from '../catalog/item.service.js';
import { Prisma } from '../generated/prisma/index.js';
import { PrismaService } from '../prisma/prisma.service.js';

const PARTY_ENTITY = 'PARTY';

function uniqueConflict(entity: string, field: string): never {
  throw conflict(`${entity} with that ${field} already exists`, { field });
}

function isUniqueViolation(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

interface PartyRow {
  id: string;
  code: string;
  name: string;
  roles: string[];
  taxIdentifier: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  countryCode: string | null;
  isActive: boolean;
  customFields: Prisma.JsonValue;
  paymentTermDays: number | null;
  creditLimit: { toFixed(digits: number): string } | null;
  deliveryAddress: string | null;
}

function toRecord(row: PartyRow): Party {
  return partySchema.parse({
    id: row.id,
    code: row.code,
    name: row.name,
    roles: row.roles,
    taxIdentifier: row.taxIdentifier,
    email: row.email,
    phone: row.phone,
    address: row.address,
    city: row.city,
    countryCode: row.countryCode,
    isActive: row.isActive,
    customFields: row.customFields,
    ...(row.roles.includes('CUSTOMER')
      ? {
          customerTerms: {
            paymentTermDays: row.paymentTermDays ?? 0,
            creditLimit: row.creditLimit?.toFixed(3) ?? null,
            deliveryAddress: row.deliveryAddress,
          },
        }
      : {}),
  });
}

/** The terms columns, forced to null for a record that is not a Customer. */
function termsColumns(input: PartyInput): {
  paymentTermDays: number | null;
  creditLimit: string | null;
  deliveryAddress: string | null;
} {
  if (!input.roles.includes('CUSTOMER')) {
    return { paymentTermDays: null, creditLimit: null, deliveryAddress: null };
  }
  return {
    paymentTermDays: input.customerTerms?.paymentTermDays ?? null,
    creditLimit: input.customerTerms?.creditLimit ?? null,
    deliveryAddress: input.customerTerms?.deliveryAddress ?? null,
  };
}

@Injectable()
export class PartyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    input: unknown,
    actor: { id: string; email: string },
    ipAddress?: string | null,
  ): Promise<Party> {
    const parsed = partyInputSchema.parse(input);
    await assertTermsAllowed(parsed);

    try {
      const row = await this.prisma.party.create({
        data: {
          code: parsed.code,
          name: parsed.name,
          roles: [...parsed.roles],
          taxIdentifier: parsed.taxIdentifier,
          email: parsed.email,
          phone: parsed.phone,
          address: parsed.address,
          city: parsed.city,
          countryCode: parsed.countryCode,
          isActive: parsed.isActive,
          customFields: (parsed.customFields ?? {}) as Prisma.InputJsonValue,
          ...termsColumns(parsed),
        },
      });
      const record = toRecord(row);
      await this.audit.record(
        this.prisma,
        { action: 'party.created', entityType: PARTY_ENTITY, entityId: row.id, after: record },
        { ...actor, ipAddress: ipAddress ?? null },
      );
      return record;
    } catch (error) {
      if (isUniqueViolation(error)) {
        const target = (error as { meta?: { target?: string[] } }).meta?.target;
        uniqueConflict('Party', target?.includes('taxIdentifier') ? 'tax identifier' : 'code');
      }
      throw error;
    }
  }

  /**
   * The paged, searchable directory (Q10, story 32).
   *
   * The INTERNAL party is Setup's bookkeeping row for production's internal
   * movements — it must never appear in the user-facing directory. It stays
   * in the table (production resolves it by code) and stays reachable by id
   * for any internal caller holding the id; only the directory hides it.
   */
  async list(query: unknown): Promise<Paged<Party>> {
    const parsed = partyListQuerySchema.parse(query);
    const where: Prisma.PartyWhereInput = {
      ...this.searchWhere(parsed),
      code: { not: 'INTERNAL' },
    };
    if (parsed.role) {
      where.roles = { has: parsed.role };
    }
    const [rows, total] = await Promise.all([
      this.prisma.party.findMany({
        where,
        orderBy: { code: 'asc' },
        skip: (parsed.page - 1) * parsed.pageSize,
        take: parsed.pageSize,
      }),
      this.prisma.party.count({ where }),
    ]);
    return { items: rows.map(toRecord), total, page: parsed.page, pageSize: parsed.pageSize };
  }

  async findById(id: string): Promise<Party | null> {
    const row = await this.prisma.party.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  }

  /**
   * Edit a Party, or retire it with `isActive: false`. A Party that loses the
   * CUSTOMER role loses its terms with the same write, so no record can carry
   * terms it is no longer entitled to.
   */
  async update(
    id: string,
    input: unknown,
    actor: { id: string; email: string },
    ipAddress?: string | null,
  ): Promise<Party> {
    const before = await this.prisma.party.findUnique({ where: { id } });
    if (!before) throw notFound('Party', id);

    const patch = partyInputSchema.partial().parse(input);
    /* The schema already constrained `roles` to the two role codes; the cast only
       re-narrows the Prisma `string[]` of the stored row. */
    const merged: PartyInput = {
      code: patch.code ?? before.code,
      name: patch.name ?? before.name,
      roles: (patch.roles ?? before.roles) as PartyInput['roles'],
      taxIdentifier: patch.taxIdentifier === undefined ? before.taxIdentifier : patch.taxIdentifier,
      email: patch.email === undefined ? before.email : patch.email,
      phone: patch.phone === undefined ? before.phone : patch.phone,
      address: patch.address === undefined ? before.address : patch.address,
      city: patch.city === undefined ? before.city : patch.city,
      countryCode: patch.countryCode === undefined ? before.countryCode : patch.countryCode,
      isActive: patch.isActive ?? before.isActive,
      customFields:
        patch.customFields === undefined
          ? (before.customFields as Record<string, unknown>)
          : (patch.customFields ?? {}),
      customerTerms: patch.customerTerms,
    };
    await assertTermsAllowed(merged);

    // Terms follow the CUSTOMER role: an edit that keeps the role and skips the
    // terms leaves them intact; one that drops the role clears them.
    const terms = merged.roles.includes('CUSTOMER')
      ? {
          paymentTermDays:
            patch.customerTerms === undefined
              ? before.paymentTermDays
              : (patch.customerTerms.paymentTermDays ?? null),
          creditLimit:
            patch.customerTerms === undefined
              ? (before.creditLimit?.toFixed(3) ?? null)
              : (patch.customerTerms.creditLimit ?? null),
          deliveryAddress:
            patch.customerTerms === undefined
              ? before.deliveryAddress
              : (patch.customerTerms.deliveryAddress ?? null),
        }
      : { paymentTermDays: null, creditLimit: null, deliveryAddress: null };
    try {
      const row = await this.prisma.party.update({
        where: { id },
        data: {
          ...(patch.code !== undefined && { code: patch.code }),
          ...(patch.name !== undefined && { name: patch.name }),
          ...(patch.roles !== undefined && { roles: [...patch.roles] }),
          ...(patch.taxIdentifier !== undefined && { taxIdentifier: patch.taxIdentifier }),
          ...(patch.email !== undefined && { email: patch.email }),
          ...(patch.phone !== undefined && { phone: patch.phone }),
          ...(patch.address !== undefined && { address: patch.address }),
          ...(patch.city !== undefined && { city: patch.city }),
          ...(patch.countryCode !== undefined && { countryCode: patch.countryCode }),
          ...(patch.isActive !== undefined && { isActive: patch.isActive }),
          ...(patch.customFields !== undefined && {
            customFields: patch.customFields as Prisma.InputJsonValue,
          }),
          paymentTermDays: terms.paymentTermDays,
          creditLimit: terms.creditLimit,
          deliveryAddress: terms.deliveryAddress,
        },
      });
      const record = toRecord(row);
      await this.audit.record(
        this.prisma,
        {
          action: 'party.updated',
          entityType: PARTY_ENTITY,
          entityId: row.id,
          before: toRecord(before),
          after: record,
        },
        { ...actor, ipAddress: ipAddress ?? null },
      );
      return record;
    } catch (error) {
      if (isUniqueViolation(error)) {
        const target = (error as { meta?: { target?: string[] } }).meta?.target;
        uniqueConflict('Party', target?.includes('taxIdentifier') ? 'tax identifier' : 'code');
      }
      throw error;
    }
  }

  private searchWhere(query: PageQuery): Prisma.PartyWhereInput {
    if (!query.q) return {};
    return {
      OR: [
        { code: { contains: query.q, mode: 'insensitive' } },
        { name: { contains: query.q, mode: 'insensitive' } },
        { taxIdentifier: { contains: query.q, mode: 'insensitive' } },
      ],
    };
  }
}

/** Terms may only travel with the CUSTOMER role; refused aloud otherwise. */
function assertTermsAllowed(input: PartyInput): void {
  if (input.customerTerms !== undefined && !input.roles.includes('CUSTOMER')) {
    throw validationFailed(
      'Commercial terms require the CUSTOMER role: a supplier-only Party does not hold debts.',
      { roles: input.roles },
    );
  }
}
