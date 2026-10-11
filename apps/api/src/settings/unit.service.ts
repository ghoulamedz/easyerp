/**
 * Units (spec 001 stories 13–14).
 *
 * A Unit is the smallest vocabulary of quantity (CONTEXT.md). Editing a Unit
 * cannot change the Stock Ledger's history — a past entry keeps its stored unit
 * — so units are edited, and retired, never deleted. That is why GET/POST/PATCH
 * exist here and no DELETE route does.
 */

import { Injectable } from '@nestjs/common';

import {
  unitInputSchema,
  unitRecordSchema,
  unitUpdateSchema,
  type UnitRecord,
} from '@easyerp/contracts';

import { AuditService } from '../audit/audit.service.js';
import { conflict, notFound } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';

const UNIT_ENTITY = 'UNIT';

@Injectable()
export class UnitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<UnitRecord[]> {
    const rows = await this.prisma.unit.findMany({ orderBy: { code: 'asc' } });
    return rows.map((row) => this.toRecord(row));
  }

  async create(
    input: unknown,
    actor: { id: string; email: string },
    ipAddress?: string | null,
  ): Promise<UnitRecord> {
    const parsed = unitInputSchema.parse(input);
    await this.assertCodeFree(parsed.code);

    const row = await this.prisma.unit.create({
      data: { code: parsed.code, allowsFraction: parsed.allowsFraction, isActive: true },
    });

    await this.audit.record(
      this.prisma,
      {
        action: 'unit.created',
        entityType: UNIT_ENTITY,
        entityId: row.id,
        after: this.toRecord(row),
      },
      { ...actor, ipAddress: ipAddress ?? null },
    );

    return this.toRecord(row);
  }

  async update(
    id: string,
    patch: unknown,
    actor: { id: string; email: string },
    ipAddress?: string | null,
  ): Promise<UnitRecord> {
    const parsed = unitUpdateSchema.parse(patch);
    const before = await this.prisma.unit.findUnique({ where: { id } });
    if (!before) throw notFound(UNIT_ENTITY, id);

    if (parsed.code !== undefined && parsed.code !== before.code) {
      await this.assertCodeFree(parsed.code);
    }

    const row = await this.prisma.unit.update({
      where: { id },
      data: {
        code: parsed.code ?? before.code,
        allowsFraction: parsed.allowsFraction ?? before.allowsFraction,
        isActive: parsed.isActive ?? before.isActive,
      },
    });

    await this.audit.record(
      this.prisma,
      {
        action: 'unit.updated',
        entityType: UNIT_ENTITY,
        entityId: id,
        before: this.toRecord(before),
        after: this.toRecord(row),
      },
      { ...actor, ipAddress: ipAddress ?? null },
    );

    return this.toRecord(row);
  }

  private async assertCodeFree(code: string): Promise<void> {
    const row = await this.prisma.unit.findUnique({ where: { code } });
    if (row) throw conflict(`A Unit with code "${code}" already exists`);
  }

  private toRecord(row: {
    id: string;
    code: string;
    allowsFraction: boolean;
    isActive: boolean;
  }): UnitRecord {
    return unitRecordSchema.parse({
      id: row.id,
      code: row.code,
      allowsFraction: row.allowsFraction,
      isActive: row.isActive,
    });
  }
}
