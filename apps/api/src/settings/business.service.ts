/**
 * The Business profile (spec 001 stories 8–9).
 *
 * Every field here is a Setting: held in the database, edited by an
 * Administrator, never read from a file mounted into the container
 * (CONTEXT.md). It is the row Setup created, edited for the life of the
 * Business.
 */

import { Injectable } from '@nestjs/common';

import {
  businessProfileSchema,
  businessProfileUpdateSchema,
  type BusinessProfile,
} from '@easyerp/contracts';

import { AuditService } from '../audit/audit.service.js';
import { notFound } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';

const BUSINESS_ENTITY = 'BUSINESS';

@Injectable()
export class BusinessSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<BusinessProfile> {
    return businessProfileSchema.parse(await this.current());
  }

  /**
   * Apply a partial patch and audit the change. The audit snapshot is the whole
   * profile before and after, so the trail reconstructs the state at the moment
   * of the change even if later edits move the profile on.
   */
  async update(
    patch: unknown,
    actor: { id: string; email: string },
    ipAddress?: string | null,
  ): Promise<BusinessProfile> {
    const input = businessProfileUpdateSchema.parse(patch);
    const before = (await this.current()) as Record<string, unknown>;
    const after = { ...before, ...input };

    const business = await this.business();
    const updated = await this.prisma.business.update({
      where: { id: business.id },
      data: {
        ...input,
      },
    });

    await this.audit.record(
      this.prisma,
      {
        action: 'business-settings.updated',
        entityType: BUSINESS_ENTITY,
        entityId: business.id,
        before,
        after,
      },
      { ...actor, ipAddress: ipAddress ?? null },
    );

    return businessProfileSchema.parse(updated);
  }

  /** The Business row, or a loud failure if Setup somehow never ran. */
  private async business() {
    const row = await this.prisma.business.findFirst();
    if (!row) {
      throw notFound(BUSINESS_ENTITY, '— Setup must run before Business settings exist');
    }
    return row;
  }

  private async current(): Promise<BusinessProfile> {
    const row = await this.business();
    return {
      legalName: row.legalName,
      displayName: row.displayName,
      taxIdentifier: row.taxIdentifier,
      taxIdentifierLabel: row.taxIdentifierLabel ?? null,
      activityCode: row.activityCode ?? null,
      addressLine1: row.addressLine1 ?? null,
      addressLine2: row.addressLine2 ?? null,
      city: row.city ?? null,
      postalCode: row.postalCode ?? null,
      countryCode: row.countryCode,
      phone: row.phone ?? null,
      email: row.email ?? null,
      iban: row.iban ?? null,
      bankName: row.bankName ?? null,
      logoUrl: row.logoUrl ?? null,
      vatRegime: row.vatRegime as BusinessProfile['vatRegime'],
      currency: row.currency,
      backorderPolicy: row.backorderPolicy as BusinessProfile['backorderPolicy'],
    };
  }
}
