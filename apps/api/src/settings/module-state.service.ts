/**
 * The Module switch (spec 001 stories 19–20).
 *
 * A Module is a Business Setting: absent from navigation when off, and its
 * endpoints refuse every request server-side. Both properties hold here — the
 * guard is what makes "endpoints refuse" true no matter what a client sends.
 *
 * An absent row reads as enabled. That is the ADR 0012 release rule in action:
 * a Business that predates this table, or one restored from a backup of such,
 * gets the safe default with no manual migration.
 */

import { Injectable } from '@nestjs/common';

import {
  MODULES,
  moduleCodeSchema,
  moduleStateSchema,
  moduleStateUpdateSchema,
  type ModuleCode,
  type ModuleState,
} from '@easyerp/contracts';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ModuleStateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Every Module and whether it answers requests. Absent rows read as enabled. */
  async list(): Promise<ModuleState[]> {
    const rows = await this.prisma.moduleState.findMany();
    const byCode = new Map(rows.map((row) => [row.module, row.isEnabled]));
    return MODULES.map((module) =>
      moduleStateSchema.parse({ module, isEnabled: byCode.get(module) ?? true }),
    );
  }

  /** Switch a Module. The next request is refused or admitted; nothing is cached. */
  async set(
    module: ModuleCode,
    update: unknown,
    actor: { id: string; email: string },
    ipAddress?: string | null,
  ): Promise<ModuleState> {
    const { isEnabled } = moduleStateUpdateSchema.parse(update);
    const code = moduleCodeSchema.parse(module);

    const before = await this.isEnabled(code);

    await this.prisma.moduleState.upsert({
      where: { module: code },
      create: { module: code, isEnabled },
      update: { isEnabled },
    });

    await this.audit.record(
      this.prisma,
      {
        action: isEnabled ? 'module.enabled' : 'module.disabled',
        entityType: 'MODULE',
        entityId: code,
        before: { isEnabled: before },
        after: { isEnabled },
      },
      { ...actor, ipAddress: ipAddress ?? null },
    );

    return moduleStateSchema.parse({ module: code, isEnabled });
  }

  /** Whether a Module answers requests. Absent rows read as enabled. */
  async isEnabled(module: ModuleCode): Promise<boolean> {
    const row = await this.prisma.moduleState.findUnique({ where: { module } });
    return row?.isEnabled ?? true;
  }
}
