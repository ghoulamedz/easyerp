/**
 * Number patterns (spec 001 story 15, ADR 0006).
 *
 * A pattern is a template the numbering engine renders; changing one changes
 * how future documents are numbered and never renumbers past ones, because an
 * issued document is immutable. `number_pattern` rows are therefore a put,
 * never a delete — the seven Document types always have a pattern, default or
 * edited (CONTEXT.md).
 */

import { Injectable } from '@nestjs/common';

import {
  DOCUMENT_TYPES,
  documentTypeSchema,
  numberPatternRecordSchema,
  numberPatternUpdateSchema,
  type DocumentType,
  type NumberPatternRecord,
} from '@easyerp/contracts';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DEFAULT_PATTERNS } from '../numbering/document-numbering.service.js';

const NUMBER_PATTERN_ENTITY = 'NUMBER_PATTERN';

@Injectable()
export class NumberPatternService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Every Document type's pattern, stored or default — all seven, always. */
  async list(): Promise<NumberPatternRecord[]> {
    const rows = await this.prisma.numberPattern.findMany();
    const stored = new Map(rows.map((row) => [row.code, row]));

    return DOCUMENT_TYPES.map((code) => {
      const row = stored.get(code);
      return numberPatternRecordSchema.parse({
        code,
        pattern: row?.pattern ?? DEFAULT_PATTERNS[code],
        padding: row?.padding ?? 4,
      });
    });
  }

  /** Replace a pattern and its padding; the sequence already allocated stays intact. */
  async set(
    code: string,
    patch: unknown,
    actor: { id: string; email: string },
    ipAddress?: string | null,
  ): Promise<NumberPatternRecord> {
    const docType = documentTypeSchema.parse(code);
    const parsed = numberPatternUpdateSchema.parse(patch);
    const before = await this.prisma.numberPattern.findUnique({ where: { code: docType } });
    const beforeRecord = before
      ? numberPatternRecordSchema.parse({
          code: before.code,
          pattern: before.pattern,
          padding: before.padding,
        })
      : numberPatternRecordSchema.parse({
          code: docType,
          pattern: DEFAULT_PATTERNS[docType],
          padding: 4,
        });

    const row = await this.prisma.numberPattern.upsert({
      where: { code: docType },
      create: { code: docType, pattern: parsed.pattern, padding: parsed.padding },
      update: { pattern: parsed.pattern, padding: parsed.padding },
    });

    await this.audit.record(
      this.prisma,
      {
        action: 'number-pattern.updated',
        entityType: NUMBER_PATTERN_ENTITY,
        entityId: docType,
        before: beforeRecord,
        after: numberPatternRecordSchema.parse({
          code: row.code,
          pattern: row.pattern,
          padding: row.padding,
        }),
      },
      { ...actor, ipAddress: ipAddress ?? null },
    );

    return numberPatternRecordSchema.parse({
      code: row.code as DocumentType,
      pattern: row.pattern,
      padding: row.padding,
    });
  }
}
