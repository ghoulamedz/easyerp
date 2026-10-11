/**
 * Terminology labels (ADR 0009, spec 001 stories 16–18).
 *
 * A `Label` row is an override of the reviewed default wording for one code in
 * one locale. Deleting the row restores the default — which is why the wire
 * carries an empty string to mean "delete": storing the empty string would be
 * a permanent override that reads as a mistake with no way to undo it visually.
 *
 * Document labels are read by the rendering path; the resolver in
 * `finance/terminology.ts` overlays them on the defaults and never sees the
 * database itself. This service is that overlay's read side and the
 * Administrator's write side.
 */

import { Injectable } from '@nestjs/common';

import {
  labelRecordSchema,
  labelUpsertSchema,
  labelTypeSchema,
  type LabelRecord,
} from '@easyerp/contracts';
import type { Locale } from '@easyerp/contracts';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { InvoiceLabelCode } from '../finance/terminology.js';

const LABEL_ENTITY = 'LABEL';

@Injectable()
export class LabelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(entityType: string): Promise<LabelRecord[]> {
    const type = labelTypeSchema.parse(entityType);
    const rows = await this.prisma.label.findMany({
      where: { entityType: type },
      orderBy: [{ entityCode: 'asc' }, { locale: 'asc' }],
    });
    return rows.map((row) =>
      labelRecordSchema.parse({
        entityType: row.entityType,
        entityCode: row.entityCode,
        locale: row.locale,
        value: row.value,
      }),
    );
  }

  /**
   * Upsert an override, or delete it on an empty string. Returns the stored
   * label, or `null` when the call removed the override so the default stands.
   */
  async upsert(
    input: unknown,
    actor: { id: string; email: string },
    ipAddress?: string | null,
  ): Promise<LabelRecord | null> {
    const parsed = labelUpsertSchema.parse(input);
    const entityId = `${parsed.entityType}:${parsed.entityCode}:${parsed.locale}`;
    const before = await this.prisma.label.findFirst({
      where: {
        entityType: parsed.entityType,
        entityCode: parsed.entityCode,
        locale: parsed.locale,
      },
    });

    if (parsed.value === '') {
      if (before) {
        await this.prisma.label.delete({ where: { id: before.id } });
      }
      await this.audit.record(
        this.prisma,
        {
          action: 'label.removed',
          entityType: LABEL_ENTITY,
          entityId,
          before: this.toRecord(before),
        },
        { ...actor, ipAddress: ipAddress ?? null },
      );
      return null;
    }

    const row = await this.prisma.label.upsert({
      where: {
        entityType_entityCode_locale: {
          entityType: parsed.entityType,
          entityCode: parsed.entityCode,
          locale: parsed.locale,
        },
      },
      create: parsed,
      update: { value: parsed.value },
    });

    await this.audit.record(
      this.prisma,
      {
        action: 'label.upserted',
        entityType: LABEL_ENTITY,
        entityId,
        before: this.toRecord(before),
        after: this.toRecord(row),
      },
      { ...actor, ipAddress: ipAddress ?? null },
    );

    return this.toRecord(row);
  }

  /** The document overrides for a locale, for the render path to overlay. */
  async forDocument(locale: Locale): Promise<Partial<Record<InvoiceLabelCode, string>>> {
    const rows = await this.prisma.label.findMany({
      where: { entityType: 'DOCUMENT', locale },
      select: { entityCode: true, value: true },
    });
    const overrides: Partial<Record<InvoiceLabelCode, string>> = {};
    for (const row of rows) {
      overrides[row.entityCode as InvoiceLabelCode] = row.value;
    }
    return overrides;
  }

  private toRecord(
    row: {
      entityType: string;
      entityCode: string;
      locale: string;
      value: string;
    } | null,
  ): LabelRecord | null {
    if (!row) return null;
    return labelRecordSchema.parse(row);
  }
}
