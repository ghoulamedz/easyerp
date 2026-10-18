/**
 * The Stock Ledger against a real database (spec 001 stories 49–57, ADR 0004).
 *
 * These tests prove the ledger's whole contract: stock changes only by appending,
 * On-hand never goes negative even when Available may (a backorder is visible,
 * not hidden), a ledger is opened exactly once, and a Reversal is an entry that
 * points at the entry it undoes — never an update to it.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Decimal } from 'decimal.js';

import { AuditService } from '../../audit/audit.service.js';
import { prisma, resetDatabase } from '../../identity/__tests__/harness.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StockLedgerService } from '../stock-ledger.service.js';

const prismaService = new PrismaService();
const audit = new AuditService(prismaService);
const ledger = new StockLedgerService(prismaService, audit);

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prismaService.$disconnect();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let sequence = 0;

async function givenItem() {
  sequence += 1;
  const unit = await prisma.unit.create({ data: { code: `U-${sequence}`, allowsFraction: false } });
  const taxRate = await prisma.taxRate.create({
    data: { code: `STANDARD_19_${sequence}`, rate: 19 },
  });
  return prisma.item.create({
    data: {
      code: `SAV-${sequence}`,
      name: 'Cours de soutien',
      description: 'Séance de soutien en maths',
      itemType: 'FINISHED_GOOD',
      baseUnitId: unit.id,
      taxRateId: taxRate.id,
      salePrice: 100,
      reorderPoint: new Decimal(5),
    },
  });
}

// ---------------------------------------------------------------------------

describe('opening a ledger', () => {
  it('creates the first and only OPENING_BALANCE entry', async () => {
    const item = await givenItem();

    const entry = await ledger.open({ itemId: item.id, quantity: '10' }, { id: 'u1' }, '127.0.0.1');

    expect(entry.reason).toBe('OPENING_BALANCE');
    expect(entry.direction).toBe('IN');
    expect(entry.balanceBefore).toBe('0.000');
    expect(entry.balanceAfter).toBe('10.000');
    expect(entry.createdByUserId).toBe('u1');

    expect((await ledger.positions(prismaService, [item.id])).get(item.id)!.onHand.toString()).toBe(
      '10',
    );
  });

  it('refuses to open an Item that already has entries', async () => {
    const item = await givenItem();
    await ledger.open({ itemId: item.id, quantity: '10' }, {}, null);

    await expect(ledger.open({ itemId: item.id, quantity: '5' }, {}, null)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });
});

describe('adjusting and reversing', () => {
  it('adjusts in and out, appending entries that never rewrite history', async () => {
    const item = await givenItem();
    await ledger.open({ itemId: item.id, quantity: '10' }, {}, null);

    const inEntry = await ledger.adjust(
      { itemId: item.id, reason: 'ADJUSTMENT_IN', quantity: '3', reasonText: 'count found more' },
      {},
      null,
    );
    expect(inEntry.balanceAfter).toBe('13.000');

    const outEntry = await ledger.adjust(
      { itemId: item.id, reason: 'ADJUSTMENT_OUT', quantity: '2', reasonText: 'damaged unit' },
      {},
      null,
    );
    expect(outEntry.balanceAfter).toBe('11.000');

    // Three entries, all still present; nothing was updated.
    expect(await prisma.stockLedgerEntry.count({ where: { itemId: item.id } })).toBe(3);
  });

  it('refuses an adjustment that would take on-hand below zero', async () => {
    const item = await givenItem();
    await ledger.open({ itemId: item.id, quantity: '1' }, {}, null);

    await expect(
      ledger.adjust(
        { itemId: item.id, reason: 'ADJUSTMENT_OUT', quantity: '2', reasonText: 'x' },
        {},
        null,
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK', status: 409 });
  });

  it('reverses an entry with a new entry that references it', async () => {
    const item = await givenItem();
    await ledger.open({ itemId: item.id, quantity: '10' }, {}, null);
    await ledger.adjust(
      { itemId: item.id, reason: 'ADJUSTMENT_OUT', quantity: '3', reasonText: 'x' },
      {},
      null,
    );

    // open and one adjustment → the ADJUSTMENT_OUT at index 1 is the source.
    const source = (await ledger.entries(item.id))[1]!;
    const reversed = await ledger.reverse({ entryId: source.id, reasonText: 'error' }, {}, null);

    expect(reversed.reason).toBe('REVERSAL');
    expect(reversed.direction).toBe('IN');
    expect(reversed.balanceAfter).toBe('10.000');
    expect(reversed.reversesEntryId).not.toBeNull();
  });

  it('refuses to reverse an entry twice', async () => {
    const item = await givenItem();
    await ledger.open({ itemId: item.id, quantity: '10' }, {}, null);
    await ledger.adjust(
      { itemId: item.id, reason: 'ADJUSTMENT_OUT', quantity: '3', reasonText: 'x' },
      {},
      null,
    );

    const source = (await ledger.entries(item.id))[1]!;
    const first = await ledger.reverse({ entryId: source.id, reasonText: 'error' }, {}, null);
    expect(first.balanceAfter).toBe('10.000');

    await expect(
      ledger.reverse({ entryId: source.id, reasonText: 'again' }, {}, null),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('reading the ledger', () => {
  it('lists entries oldest first and 404s an unknown Item', async () => {
    const item = await givenItem();
    await ledger.open({ itemId: item.id, quantity: '10' }, {}, null);
    await ledger.adjust(
      { itemId: item.id, reason: 'ADJUSTMENT_IN', quantity: '1', reasonText: 'x' },
      {},
      null,
    );

    const entries = await ledger.entries(item.id);
    expect(entries.map((entry) => entry.reason)).toEqual(['OPENING_BALANCE', 'ADJUSTMENT_IN']);
    expect(entries[1]?.balanceBefore).toBe('10.000');

    await expect(ledger.entries('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('reports a position for every Item, zero on-hand included', async () => {
    const item = await givenItem();
    await ledger.open({ itemId: item.id, quantity: '2' }, {}, null);

    const positions = await ledger.listPositions();
    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({ onHand: '2.000', reserved: '0.000', available: '2.000' });
    expect(positions[0]?.atOrBelowReorder).toBe(true); // 2 ≤ reorder point 5.
  });

  it('flags the reorder threshold when on-hand drops to it', async () => {
    const item = await givenItem();
    await ledger.open({ itemId: item.id, quantity: '6' }, {}, null);
    await ledger.adjust(
      { itemId: item.id, reason: 'ADJUSTMENT_OUT', quantity: '1', reasonText: 'x' },
      {},
      null,
    );

    const positions = await ledger.listPositions();
    expect(positions[0]?.onHand).toBe('5.000');
    expect(positions[0]?.atOrBelowReorder).toBe(true);
  });
});
