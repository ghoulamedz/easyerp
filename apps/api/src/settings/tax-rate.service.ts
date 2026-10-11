/**
 * Tax Rates (spec 001 stories 10–12).
 *
 * A rate is a row with effective dates, never a literal in code. Rates are
 * retired, never deleted — a rate an issued Document was priced under keeps
 * rendering even after it stops applying, which is why there is no DELETE route
 * here at all, the same way an issued invoice has none.
 */

import { Injectable } from '@nestjs/common';

import {
  taxRateInputSchema,
  taxRateRecordSchema,
  taxRateUpdateSchema,
  type TaxRateRecord,
} from '@easyerp/contracts';

import { AuditService } from '../audit/audit.service.js';
import { conflict, notFound, validationFailed } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';

const TAX_RATE_ENTITY = 'TAX_RATE';

@Injectable()
export class TaxRateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<TaxRateRecord[]> {
    const rows = await this.prisma.taxRate.findMany({ orderBy: { code: 'asc' } });
    return rows.map((row) => this.toRecord(row));
  }

  async create(
    input: unknown,
    actor: { id: string; email: string },
    ipAddress?: string | null,
  ): Promise<TaxRateRecord> {
    const parsed = taxRateInputSchema.parse(input);
    await this.assertCodeFree(parsed.code);
    this.assertDates(parsed.activeFrom, parsed.activeTo);

    const row = await this.prisma.taxRate.create({
      data: {
        code: parsed.code,
        rate: parsed.rate,
        activeFrom: new Date(`${parsed.activeFrom}T00:00:00.000Z`),
        activeTo: parsed.activeTo ? new Date(`${parsed.activeTo}T00:00:00.000Z`) : null,
        isActive: true,
      },
    });

    await this.audit.record(
      this.prisma,
      {
        action: 'tax-rate.created',
        entityType: TAX_RATE_ENTITY,
        entityId: row.id,
        after: this.toRecord(row),
      },
      { ...actor, ipAddress: ipAddress ?? null },
    );

    return this.toRecord(row);
  }

  /**
   * A partial edit, including retirement (`{ isActive: false }`). Retiring keeps
   * the row and its history; issued documents still render their stored rate.
   */
  async update(
    id: string,
    patch: unknown,
    actor: { id: string; email: string },
    ipAddress?: string | null,
  ): Promise<TaxRateRecord> {
    const parsed = taxRateUpdateSchema.parse(patch);
    const before = await this.prisma.taxRate.findUnique({ where: { id } });
    if (!before) throw notFound(TAX_RATE_ENTITY, id);

    if (parsed.code !== undefined && parsed.code !== before.code) {
      await this.assertCodeFree(parsed.code);
    }

    // The effective window after the patch, computed against the stored row so
    // that a patch touching only one side still gets the ordering rule checked.
    const effFrom = parsed.activeFrom ?? toCalendarDate(before.activeFrom);
    const effTo = parsed.activeTo === undefined ? toCalendarDate(before.activeTo) : parsed.activeTo;
    this.assertDates(effFrom, effTo);

    const row = await this.prisma.taxRate.update({
      where: { id },
      data: {
        code: parsed.code ?? before.code,
        rate: parsed.rate ?? before.rate.toString(),
        activeFrom: parsed.activeFrom ? dateFromCalendar(parsed.activeFrom) : before.activeFrom,
        activeTo:
          parsed.activeTo === undefined
            ? before.activeTo
            : parsed.activeTo
              ? dateFromCalendar(parsed.activeTo)
              : null,
        isActive: parsed.isActive ?? before.isActive,
      },
    });

    await this.audit.record(
      this.prisma,
      {
        action: 'tax-rate.updated',
        entityType: TAX_RATE_ENTITY,
        entityId: id,
        before: this.toRecord(before),
        after: this.toRecord(row),
      },
      { ...actor, ipAddress: ipAddress ?? null },
    );

    return this.toRecord(row);
  }

  private async assertCodeFree(code: string): Promise<void> {
    const row = await this.prisma.taxRate.findUnique({ where: { code } });
    if (row) throw conflict(`A Tax Rate with code "${code}" already exists`);
  }

  private assertDates(activeFrom: string | null, activeTo: string | null | undefined): void {
    if (activeFrom && activeTo && activeTo < activeFrom) {
      throw validationFailed('A Tax Rate cannot cease applying before it starts applying');
    }
  }

  private toRecord(row: {
    id: string;
    code: string;
    rate: { toString(): string } | string;
    activeFrom: Date;
    activeTo: Date | null;
    isActive: boolean;
  }): TaxRateRecord {
    return taxRateRecordSchema.parse({
      id: row.id,
      code: row.code,
      rate: typeof row.rate === 'string' ? row.rate : row.rate.toString(),
      activeFrom: toCalendarDate(row.activeFrom),
      activeTo: row.activeTo ? toCalendarDate(row.activeTo) : null,
      isActive: row.isActive,
    });
  }
}

/** A UTC calendar date for the column; time-of-day is a Settings concern, not a rate's. */
function dateFromCalendar(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toCalendarDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}
