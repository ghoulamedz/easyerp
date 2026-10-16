/**
 * The Stock Ledger (ADR 0004, spec 001 stories 49–57).
 *
 * Stock changes by appending an entry, and only ever by appending an entry. There
 * is no balance column: On-hand is the `balanceAfter` of the latest entry, a
 * Reversal is a new entry that points at the one it undoes, and an existing entry
 * is never touched. An adjustment is therefore a correction, not an edit — history
 * is what the audit trail is for, and a ledger that rewrites itself cannot be
 * audited.
 *
 * `direction` is never chosen by a caller: it is *derived* from the reason, and a
 * `REVERSAL` takes the opposite of the entry it reverses. The one place stock is
 * promised is a Reservation (see `SalesOrderService`); `available` is
 * `onHand − reserved` and only exists in responses.
 */

import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';

import {
  directionOf,
  stockAdjustmentSchema,
  stockLedgerEntrySchema,
  stockOpeningBalanceSchema,
  stockReversalSchema,
  type StockLedgerEntry,
  type StockLedgerReason,
} from '@easyerp/contracts';

import { AuditService, type AuditActor } from '../audit/audit.service.js';
import { conflict, notFound, validationFailed, DomainError } from '../common/errors.js';
import { Prisma } from '../generated/prisma/index.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** The client surface the pure reads need, so a caller's transaction can drive them. */
export type LedgerClient = Pick<PrismaService, '$queryRaw'>;

export interface LedgerPosition {
  readonly onHand: Decimal;
  readonly reserved: Decimal;
  readonly available: Decimal;
}

const ZERO = new Decimal(0);

export interface AppendEntryInput {
  readonly itemId: string;
  readonly reason: StockLedgerReason;
  /** Positive; the derived direction carries the sign. A Reversal reuses the source's. */
  readonly quantity: Decimal;
  readonly documentType?: string | null;
  readonly documentId?: string | null;
  readonly reasonText?: string | null;
  readonly reversesEntryId?: string | null;
  /** The acting user, when the entry is human-made. Null stays null: the DB column is nullable. */
  readonly createdByUserId?: string | null;
}

@Injectable()
export class StockLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The On-hand, Reserved and Available of the given Items, read through the
   * caller's client so a transaction sees its own uncommitted rows. Available is
   * deliberately allowed to be negative: an ALLOW backorder promises stock the
   * Business does not hold, and hiding that behind a zero is the legacy
   * overselling bug this ledger exists to make visible.
   */
  async positions(
    client: LedgerClient,
    itemIds: readonly string[],
  ): Promise<Map<string, LedgerPosition>> {
    const ids = [...new Set(itemIds)];
    if (ids.length === 0) return new Map();

    const onHandRows = await client.$queryRaw<{ itemId: string; balanceAfter: Decimal }[]>`
      SELECT DISTINCT ON ("itemId") "itemId", "balanceAfter"
      FROM stock_ledger_entry
      WHERE "itemId" IN (${Prisma.join(ids)})
      ORDER BY "itemId", seq DESC
    `;
    const reservedRows = await client.$queryRaw<{ itemId: string; total: Decimal }[]>`
      SELECT "itemId", COALESCE(SUM(quantity - "deliveredQuantity"), 0) AS total
      FROM reservation
      WHERE "itemId" IN (${Prisma.join(ids)}) AND "releasedAt" IS NULL
      GROUP BY "itemId"
    `;

    const onHandBy = new Map(onHandRows.map((row) => [row.itemId, row.balanceAfter]));
    const reservedBy = new Map(reservedRows.map((row) => [row.itemId, row.total]));

    const result = new Map<string, LedgerPosition>();
    for (const itemId of ids) {
      const onHand = onHandBy.get(itemId) ?? ZERO;
      const reserved = reservedBy.get(itemId) ?? ZERO;
      result.set(itemId, { onHand, reserved, available: onHand.minus(reserved) });
    }
    return result;
  }

  /** The latest ledged balance of one Item, through the caller's client. */
  async balanceOf(client: LedgerClient, itemId: string): Promise<Decimal> {
    const rows = await client.$queryRaw<{ balanceAfter: Decimal }[]>`
      SELECT "balanceAfter"
      FROM stock_ledger_entry
      WHERE "itemId" = ${itemId}
      ORDER BY seq DESC
      LIMIT 1
    `;
    return rows[0]?.balanceAfter ?? ZERO;
  }

  /** Open an Item: the starting on-hand, and only the first entry it may ever have. */
  async open(
    input: unknown,
    actor: AuditActor = {},
    ipAddress?: string | null,
  ): Promise<StockLedgerEntry> {
    const parsed = stockOpeningBalanceSchema.parse(input);
    return this.write(parsed.itemId, actor, ipAddress, async (tx) => {
      const existing = await tx.stockLedgerEntry.findFirst({ where: { itemId: parsed.itemId } });
      if (existing) {
        throw validationFailed(
          `Item ${parsed.itemId} already has ledger entries; opening again would rewrite what it holds.`,
          { itemId: parsed.itemId },
        );
      }
      return this.appendEntry(tx, {
        itemId: parsed.itemId,
        reason: 'OPENING_BALANCE',
        quantity: new Decimal(parsed.quantity),
        createdByUserId: actor.id ?? null,
      });
    });
  }

  /** Adjust stock: a reasoned count that corrects the ledger in or out. */
  async adjust(
    input: unknown,
    actor: AuditActor = {},
    ipAddress?: string | null,
  ): Promise<StockLedgerEntry> {
    const parsed = stockAdjustmentSchema.parse(input);
    return this.write(parsed.itemId, actor, ipAddress, async (tx) =>
      this.appendEntry(tx, {
        itemId: parsed.itemId,
        reason: parsed.reason,
        quantity: new Decimal(parsed.quantity),
        reasonText: parsed.reasonText,
        createdByUserId: actor.id ?? null,
      }),
    );
  }

  /** Reverse a ledger entry: the newest entry on the ledger, undoing the one it names. */
  async reverse(
    input: unknown,
    actor: AuditActor = {},
    ipAddress?: string | null,
  ): Promise<StockLedgerEntry> {
    const parsed = stockReversalSchema.parse(input);

    // The source lookup lives inside the transaction: a lookup outside it can
    // name an entry that is reversed by a concurrent transaction before this
    // one's `appendEntry` runs, and the refusal would then be a surprise.
    const row = await this.prisma.$transaction(async (tx) => {
      const source = await tx.stockLedgerEntry.findUnique({
        where: { id: parsed.entryId },
      });
      if (!source) throw notFound('Stock Ledger Entry', parsed.entryId);

      const created = await this.appendEntry(tx, {
        itemId: source.itemId,
        reason: 'REVERSAL',
        quantity: source.quantity,
        reversesEntryId: source.id,
        reasonText: parsed.reasonText,
        createdByUserId: actor.id ?? null,
      });
      await this.audit.record(
        tx,
        {
          action: 'stock.reversal',
          entityType: 'ITEM',
          entityId: source.itemId,
          after: { entryId: created.id, reason: created.reason, quantity: created.quantity },
        },
        { ...actor, ipAddress: ipAddress ?? null },
      );
      return created;
    });

    const found = await this.prisma.stockLedgerEntry.findUniqueOrThrow({
      where: { id: row.id },
    });
    return toLedgerEntry(found);
  }

  /**
   * The append-only ledger of one Item, oldest first.
   *
   * The Item must exist; entries for an Item nobody can see would be how a
   * mistyped id reads as an empty inventory, which is a lie.
   */
  async entries(itemId: string): Promise<StockLedgerEntry[]> {
    // A read-only read takes no row lock: `FOR UPDATE` here would serialize
    // every stock screen and export against every concurrent writer.
    const item = await this.prisma.item.findUnique({ where: { id: itemId } });
    if (!item) throw notFound('Item', itemId);
    const rows = await this.prisma.stockLedgerEntry.findMany({ where: { itemId }, orderBy: { seq: 'asc' } });
    return rows.map(toLedgerEntry);
  }

  /**
   * The position of every Item, with the Item identity and reorder signal a stock
   * screen and the CSV export need (stories 56–57). Every Item gets a row:
   * on-hand zero is a real, reportable state, not an absent one.
   */
  async listPositions(): Promise<
    {
      itemId: string;
      code: string;
      name: string;
      onHand: string;
      reserved: string;
      available: string;
      reorderPoint: string | null;
      atOrBelowReorder: boolean;
    }[]
  > {
    const items = await this.prisma.item.findMany({
      where: { itemType: { not: 'SERVICE' } },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, reorderPoint: true, itemType: true },
    });

    const ids = items.map((item) => item.id);
    if (ids.length === 0) return [];
    // A read-only read takes no row lock: `FOR UPDATE` here would serialize
    // every stock screen and export against every concurrent writer.
    const positions = await this.positions(
      this.prisma,
      ids,
    );

    return items.map((item) => {
      const position = positions.get(item.id)!;
      const onHand = position.onHand;
      const reorderPoint = item.reorderPoint ?? null;
      return {
        itemId: item.id,
        code: item.code,
        name: item.name,
        onHand: onHand.toFixed(3),
        reserved: position.reserved.toFixed(3),
        available: position.available.toFixed(3),
        reorderPoint: reorderPoint?.toFixed(3) ?? null,
        atOrBelowReorder: reorderPoint !== null && onHand.lte(reorderPoint),
      };
    });
  }

  /**
   * Append one entry to the ledger, on the caller's transaction.
   *
   * A caller reaches this directly when the stock movement belongs to a document
   * it already holds in that transaction — a Delivery Note shares the transaction
   * that issues it. The direction is derived from the reason, never supplied; an
   * OUT entry that would take the balance below zero is refused, because On-hand
   * never goes negative even when Available may.
   */
  async appendEntry(
    tx: Prisma.TransactionClient,
    input: AppendEntryInput,
  ): Promise<Prisma.StockLedgerEntryGetPayload<Record<string, never>>> {
    const before = await this.balanceOf(tx, input.itemId);

    let direction: string;
    let after: Decimal;

    if (input.reason === 'REVERSAL') {
      // Leave the audit trail legible: the reversal is refused, not the balance.
      const source = await tx.stockLedgerEntry.findUnique({
        where: { id: input.reversesEntryId ?? '' },
      });
      if (!source) throw notFound('Stock Ledger Entry', input.reversesEntryId ?? '');
      const alreadyReversed = await tx.stockLedgerEntry.findFirst({
        where: { reversesEntryId: source.id },
      });
      if (alreadyReversed) {
        throw conflict(
          `Entry ${source.id} is already reversed by ${alreadyReversed.id}; an entry is reversed once, ` +
            'and any further correction is its own entry.',
          { entryId: source.id, reversedBy: alreadyReversed.id },
        );
      }
      direction = directionOf('REVERSAL', source.direction as 'IN' | 'OUT');
      after = direction === 'IN' ? before.plus(source.quantity) : before.minus(source.quantity);
    } else {
      direction = directionOf(input.reason);
      if (input.reason === 'OPENING_BALANCE') {
        after = input.quantity;
      } else if (direction === 'IN') {
        after = before.plus(input.quantity);
      } else {
        after = before.minus(input.quantity);
      }
    }

    if (after.lt(ZERO)) {
      throw new DomainError(
        'INSUFFICIENT_STOCK',
        `A ${input.reason} would take ${input.itemId} to ${after.toFixed(3)}, below zero. ` +
          'On-hand is the ledger and the ledger never goes negative.',
        { itemId: input.itemId, reason: input.reason, balanceBefore: before.toFixed(3) },
      );
    }

    if (!direction || !['IN', 'OUT'].includes(direction)) {
      throw conflict(`Reason ${input.reason} produced an unusable direction.`, {
        reason: input.reason,
      });
    }

    // Lock the Item row to prevent concurrent ledger entries from corrupting the `seq`.
    await tx.item.findUniqueOrThrow({ where: { id: input.itemId } });
    await tx.$executeRaw`SELECT 1 FROM "item" WHERE id = ${input.itemId} FOR UPDATE`;

    const row = await tx.stockLedgerEntry.create({
      data: {
        itemId: input.itemId,
        reason: input.reason,
        direction,
        quantity: input.quantity,
        balanceBefore: before,
        balanceAfter: after,
        documentType: input.documentType ?? null,
        documentId: input.documentId ?? null,
        reasonText: input.reasonText ?? null,
        reversesEntryId: input.reversesEntryId ?? null,
        createdByUserId: input.createdByUserId ?? null,
      },
    });
    return row;
  }

  /** Wrap one write in a transaction and audit it. */
  private async write(
    itemId: string,
    actor: AuditActor,
    ipAddress: string | null | undefined,
    operation: (
      tx: Prisma.TransactionClient,
    ) => Promise<Prisma.StockLedgerEntryGetPayload<Record<string, never>>>,
  ): Promise<StockLedgerEntry> {
    const item = await this.prisma.item.findUnique({ where: { id: itemId } });
    if (!item) throw notFound('Item', itemId);

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await operation(tx);
      await this.audit.record(
        tx,
        {
          action: `stock.${created.reason.toLowerCase()}`,
          entityType: 'ITEM',
          entityId: itemId,
          after: { entryId: created.id, reason: created.reason, quantity: created.quantity },
        },
        { ...actor, ipAddress: ipAddress ?? null },
      );
      return created;
    });

    const found = await this.prisma.stockLedgerEntry.findUniqueOrThrow({
      where: { id: row.id },
    });
    return toLedgerEntry(found);
  }
}

/** The schema-shaped ledger entry for a Prisma row of decimals. */
function toLedgerEntry(row: {
  id: string;
  itemId: string;
  reason: string;
  direction: string;
  quantity: { toFixed(digits: number): string };
  balanceBefore: { toFixed(digits: number): string };
  balanceAfter: { toFixed(digits: number): string };
  documentType: string | null;
  documentId: string | null;
  reasonText: string | null;
  reversesEntryId: string | null;
  occurredAt: Date;
  createdByUserId: string | null;
}): StockLedgerEntry {
  return stockLedgerEntrySchema.parse({
    id: row.id,
    itemId: row.itemId,
    reason: row.reason,
    direction: row.direction,
    quantity: row.quantity.toFixed(3),
    balanceBefore: row.balanceBefore.toFixed(3),
    balanceAfter: row.balanceAfter.toFixed(3),
    documentType: row.documentType,
    documentId: row.documentId,
    reasonText: row.reasonText,
    reversesEntryId: row.reversesEntryId,
    occurredAt: row.occurredAt.toISOString(),
    createdByUserId: row.createdByUserId,
  });
}
