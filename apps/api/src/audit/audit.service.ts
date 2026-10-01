/**
 * The audit trail: an immutable record of who did what, to which record, with
 * the state before and after (CONTEXT.md). The legacy system had no timestamps,
 * no author and no history at all, which made every investigation a guess.
 *
 * Entries are written on the *caller's* transaction. An audit trail written on a
 * separate connection can miss a change the moment the two drift apart, and a
 * trail that misses changes is worse than none, because it looks complete.
 */

import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/index.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AuditEntryInput {
  /** What happened, in the past tense: `sales-order.issued`. */
  readonly action: string;
  readonly entityType: string;
  readonly entityId?: string | null;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly context?: unknown;
}

export interface AuditActor {
  readonly id?: string | null;
  readonly email?: string | null;
  readonly ipAddress?: string | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Append an entry to the caller's transaction. Never opens one of its own. */
  async record(
    tx: Prisma.TransactionClient,
    input: AuditEntryInput,
    actor?: AuditActor,
  ): Promise<void> {
    await tx.auditEntry.create({
      data: {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        actorId: actor?.id ?? null,
        actorEmail: actor?.email ?? null,
        ipAddress: actor?.ipAddress ?? null,
        before: toJson(input.before) ?? Prisma.JsonNull,
        after: toJson(input.after) ?? Prisma.JsonNull,
        context: toJson(input.context) ?? Prisma.JsonNull,
      },
    });
  }

  /** The trail for one record, oldest first. */
  async forEntity(
    entityType: string,
    entityId: string,
  ): Promise<readonly { occurredAt: Date; action: string; actorEmail: string | null }[]> {
    const entries = await this.prisma.auditEntry.findMany({
      where: { entityType, entityId },
      orderBy: { occurredAt: 'asc' },
      select: { occurredAt: true, action: true, actorEmail: true },
    });
    return entries;
  }
}

/**
 * Convert a domain object into a JsonB value. Round-tripping through JSON is what
 * turns class instances, `Decimal`s and `undefined` into something the column
 * accepts, and it drops anything that is not JSON at all.
 */
function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
