/**
 * The Sales Order flow against a real database (spec 001 stories 33–45).
 *
 * The heavy invariants tested here are the ones that fail loudly only at issue
 * time and would otherwise be invisible: a number appears exactly once, stock is
 * promised (Reservation) exactly as much as an issue allows, and the
 * backorderPolicy decides between refusing a shortfall and booking it as a
 * negative Available. A Draft promises nothing and prices nothing from the
 * client — the same discipline the invoice flow enforces (ADR 0005).
 */

import { rm } from 'node:fs/promises';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DomainError } from '../../common/errors.js';
import { AuditService } from '../../audit/audit.service.js';
import { StockLedgerService } from '../../inventory/stock-ledger.service.js';
import { prisma, resetDatabase } from '../../identity/__tests__/harness.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DocumentNumberingService } from '../../numbering/document-numbering.service.js';
import { DocumentArchive } from '../document-archive.js';
import { PaperPdfService } from '../../documents/paper-pdf.service.js';
import { SalesOrderService } from '../sales-order.service.js';

const prismaService = new PrismaService();
const numbering = new DocumentNumberingService(prismaService);
const audit = new AuditService(prismaService);
const stock = new StockLedgerService(prismaService, audit);
// A scratch archive root: the issue tests render-and-archive on the side, and a
// failure there is caught by the issue path, never surfaced as a test failure.
// `archiveRoot` is emptied before every test because a write to the archive is
// immutable (`wx`): a file left by an earlier test would make the next one's
// archive step fail, and a test would pass for the wrong reason.
const ARCHIVE_ROOT = '/tmp/easyerp-api-spec-archive';
const paperPdfs = new PaperPdfService(prismaService, new DocumentArchive(ARCHIVE_ROOT));
const orders = new SalesOrderService(prismaService, numbering, stock, audit, paperPdfs);

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  // Numbers restart per test, so the archive path repeats: clear it first.
  await rm(ARCHIVE_ROOT, { force: true, recursive: true });
});

afterAll(async () => {
  await prismaService.$disconnect();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let sequence = 0;

async function givenBusiness(overrides: Record<string, unknown> = {}) {
  return prisma.business.create({
    data: {
      legalName: 'Société Générale de Tutorat',
      displayName: 'SGT',
      taxIdentifier: '1234567/A/M/000',
      countryCode: 'TN',
      ...overrides,
    },
  });
}

async function givenCustomer() {
  sequence += 1;
  return prisma.party.create({
    data: {
      code: `C-${sequence}`,
      name: 'Atlas Trading',
      roles: ['CUSTOMER'],
      taxIdentifier: `9876543/B/M/000-${sequence}`,
    },
  });
}

async function givenUnit() {
  sequence += 1;
  return prisma.unit.create({ data: { code: `U-${sequence}`, allowsFraction: false } });
}

async function givenItem(overrides: { itemType?: string } & Record<string, unknown> = {}) {
  const { itemType = 'SERVICE', ...rest } = overrides;
  const unit = await givenUnit();
  const taxRate = await prisma.taxRate.create({
    data: { code: `STANDARD_19_${sequence}`, rate: 19 },
  });
  return prisma.item.create({
    data: {
      code: `SAV-${sequence}`,
      name: 'Cours de soutien',
      description: 'Séance de soutien en maths',
      itemType,
      baseUnitId: unit.id,
      taxRateId: taxRate.id,
      salePrice: 100,
      ...rest,
    },
  });
}

async function givenDraftableOrder() {
  const business = await givenBusiness();
  const customer = await givenCustomer();
  const item = await givenItem();
  return { business, customer, item };
}

// ---------------------------------------------------------------------------

describe('drafting an order', () => {
  it('prices on the server, stores no number, and promises nothing', async () => {
    const { business, customer, item } = await givenDraftableOrder();

    const draft = await orders.createDraft({
      businessId: business.id,
      partyId: customer.id,
      lines: [{ itemId: item.id, quantity: '3' }],
    });

    const stored = await prisma.document.findUniqueOrThrow({
      where: { id: draft.id },
      include: { lines: true, reservations: true },
    });

    expect(stored.status).toBe('DRAFT');
    expect(stored.number).toBeNull();
    expect(stored.issuedAt).toBeNull();
    // 3 × 100.000 at 19 % → 300.000 + 57.000.
    expect(stored.netAmount.toString()).toBe('300');
    expect(stored.taxAmount.toString()).toBe('57');
    expect(stored.grossAmount.toString()).toBe('357');
    expect(stored.lines[0]?.unitPrice.toString()).toBe('100');
    // A Draft promises nothing: no Reservation yet.
    expect(stored.reservations).toHaveLength(0);
  });

  it('refuses a body that carries its own price', async () => {
    const { business, customer, item } = await givenDraftableOrder();

    await expect(
      orders.createDraft({
        businessId: business.id,
        partyId: customer.id,
        lines: [{ itemId: item.id, quantity: '3', unitPrice: '0.010' }],
      }),
    ).rejects.toMatchObject({ name: 'ZodError' });

    expect(await prisma.document.count()).toBe(0);
  });

  it('refuses a Party that is not an active Customer', async () => {
    const { business, customer, item } = await givenDraftableOrder();
    await prisma.party.update({ where: { id: customer.id }, data: { isActive: false } });

    await expect(
      orders.createDraft({
        businessId: business.id,
        partyId: customer.id,
        lines: [{ itemId: item.id, quantity: '1' }],
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });
});

describe('editing a draft order', () => {
  it('replaces the line set, re-pricing from the Items', async () => {
    const { business, customer, item } = await givenDraftableOrder();
    const draft = await orders.createDraft({
      businessId: business.id,
      partyId: customer.id,
      lines: [{ itemId: item.id, quantity: '2' }],
    });

    const edited = await orders.update(
      draft.id,
      { lines: [{ itemId: item.id, quantity: '5' }] },
      {},
      null,
    );

    expect(edited.lines).toHaveLength(1);
    expect(edited.lines[0]?.quantity).toBe('5');
    expect(edited.totals.grossAmount).toBe('595'); // 5 × 100 at 19 %.
  });

  it('refuses to edit an issued or cancelled order', async () => {
    const { business, customer, item } = await givenDraftableOrder();
    const draft = await orders.createDraft({
      businessId: business.id,
      partyId: customer.id,
      lines: [{ itemId: item.id, quantity: '1' }],
    });
    await orders.issue(draft.id, {}, null);

    await expect(
      orders.update(draft.id, { lines: [{ itemId: item.id, quantity: '2' }] }, {}, null),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
  });
});

describe('issuing an order', () => {
  async function givenOpenStock(itemId: string, quantity: string) {
    await stock.open({ itemId, quantity }, {}, null);
  }

  it('numbers it, re-prices it, and creates a Reservation per goods line', async () => {
    const { business, customer } = await givenDraftableOrder();
    const goods = await givenItem({ itemType: 'FINISHED_GOOD' });
    const service = await givenItem({ itemType: 'SERVICE' });
    await givenOpenStock(goods.id, '10');

    const draft = await orders.createDraft({
      businessId: business.id,
      partyId: customer.id,
      lines: [
        { itemId: goods.id, quantity: '3' },
        { itemId: service.id, quantity: '1' },
      ],
    });

    const issued = await orders.issue(draft.id, {}, null);

    expect(issued.status).toBe('ISSUED');
    expect(issued.number).toMatch(/^BC-\d{4}-0001$/);

    const reservations = await prisma.reservation.findMany({ where: { salesOrderId: issued.id } });
    expect(reservations).toHaveLength(1); // service lines are never reserved
    expect(reservations[0]?.quantity.toString()).toBe('3');

    const position = await stock.positions(prismaService, [goods.id]);
    expect(position.get(goods.id)!.reserved.toString()).toBe('3');
    expect(position.get(goods.id)!.available.toString()).toBe('7');
  });

  it('re-prices at issue when the Item price changed after drafting', async () => {
    const { business, customer } = await givenDraftableOrder();
    const item = await givenItem({ itemType: 'FINISHED_GOOD', salePrice: 100 });
    await givenOpenStock(item.id, '10');

    const draft = await orders.createDraft({
      businessId: business.id,
      partyId: customer.id,
      lines: [{ itemId: item.id, quantity: '2' }],
    });
    await prisma.item.update({ where: { id: item.id }, data: { salePrice: 200 } });

    const issued = await orders.issue(draft.id, {}, null);
    expect(issued.totals.grossAmount).toBe('476'); // 2 × 200 at 19 %.
  });

  it('refuses a shortfall under STRICT and leaves the draft untouched', async () => {
    const { business, customer } = await givenDraftableOrder();
    const { item } = await givenDraftableOrder(); // a second, unopened item
    await prisma.item.update({ where: { id: item.id }, data: { itemType: 'FINISHED_GOOD' } });
    // No ledger entry at all → Available is 0.000.

    const draft = await orders.createDraft({
      businessId: business.id,
      partyId: customer.id,
      lines: [{ itemId: item.id, quantity: '3' }],
    });

    await expect(orders.issue(draft.id, {}, null)).rejects.toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      status: 409,
    });

    // The transaction rolled back: still a Draft, unnumbered, unreserved.
    const stored = await prisma.document.findUniqueOrThrow({
      where: { id: draft.id },
      include: { reservations: true },
    });
    expect(stored.status).toBe('DRAFT');
    expect(stored.number).toBeNull();
    expect(stored.reservations).toHaveLength(0);
  });

  it('books a shortfall as a backorder under ALLOW', async () => {
    const business = await givenBusiness({ backorderPolicy: 'ALLOW' });
    const customer = await givenCustomer();
    const goods = await givenItem({ itemType: 'FINISHED_GOOD' });
    // Nothing opened → Available is 0.000, and the order still issues.

    const draft = await orders.createDraft({
      businessId: business.id,
      partyId: customer.id,
      lines: [{ itemId: goods.id, quantity: '4' }],
    });

    const issued = await orders.issue(draft.id, {}, null);

    // The backorder is visible, not hidden: Available goes negative. This is the
    // legacy overselling bug made visible, the point of ADR 0004.
    const position = await stock.positions(prismaService, [goods.id]);
    expect(position.get(goods.id)!.available.toString()).toBe('-4');
    expect(
      (await prisma.reservation.count({ where: { salesOrderId: issued.id } })).toString(),
    ).toBe('1');
  });

  it('refuses to issue again, and leaves the number series without a gap', async () => {
    const { business, customer } = await givenDraftableOrder();
    const goods = await givenItem({ itemType: 'FINISHED_GOOD' });
    await stock.open({ itemId: goods.id, quantity: '10' }, {}, null);

    const draft = await orders.createDraft({
      businessId: business.id,
      partyId: customer.id,
      lines: [{ itemId: goods.id, quantity: '1' }],
    });
    await orders.issue(draft.id, {}, null);

    await expect(orders.issue(draft.id, {}, null)).rejects.toMatchObject({ code: 'CONFLICT' });

    const series = await prisma.numberSeries.findFirstOrThrow({ where: { code: 'SALES_ORDER' } });
    expect(series.nextValue).toBe(2);
  });

  it('two concurrent issues receive distinct, consecutive numbers', async () => {
    const { business, customer } = await givenDraftableOrder();
    const goods = await givenItem({ itemType: 'FINISHED_GOOD' });
    await stock.open({ itemId: goods.id, quantity: '20' }, {}, null);

    const drafts = await Promise.all([
      orders.createDraft({
        businessId: business.id,
        partyId: customer.id,
        lines: [{ itemId: goods.id, quantity: '1' }],
      }),
      orders.createDraft({
        businessId: business.id,
        partyId: customer.id,
        lines: [{ itemId: goods.id, quantity: '2' }],
      }),
    ]);

    const issued = await Promise.all(drafts.map((draft) => orders.issue(draft.id, {}, null)));
    const numbers = issued.map((order) => order.number).sort();

    expect(numbers).toEqual([
      `BC-${new Date().getUTCFullYear()}-0001`,
      `BC-${new Date().getUTCFullYear()}-0002`,
    ]);
  });

  it('archives the paper at issue and serves those same bytes back', async () => {
    // The paper is rendered once, at issue, and the archive is the only render
    // store: what the client downloads must be the bytes the Business filed,
    // not a re-render of today's terminology.
    const { business, customer } = await givenDraftableOrder();
    const goods = await givenItem({ itemType: 'FINISHED_GOOD' });
    await stock.open({ itemId: goods.id, quantity: '5' }, {}, null);

    const draft = await orders.createDraft({
      businessId: business.id,
      partyId: customer.id,
      lines: [{ itemId: goods.id, quantity: '2' }],
    });

    const issued = await orders.issue(draft.id, {}, null);

    const { pdf, sha256 } = await orders.readPdf(draft.id);

    // A PDF, not an HTML error page, and the hash describes those exact bytes.
    expect(pdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect(pdf.byteLength).toBeGreaterThan(0);

    // The row records the hash of the file that was written, so "the same bytes
    // it archived" is a comparison against the document, not against a re-render.
    const row = await prisma.document.findUniqueOrThrow({
      where: { id: issued.id },
      select: { archivePath: true, archiveSha256: true, archivedAt: true },
    });
    expect(row.archivedAt).not.toBeNull();
    expect(row.archivePath).not.toBeNull();
    expect(sha256).toBe(row.archiveSha256);
  });

  it('refuses to serve a paper for a draft that was never issued', async () => {
    const { business, customer } = await givenDraftableOrder();
    const goods = await givenItem({ itemType: 'FINISHED_GOOD' });

    const draft = await orders.createDraft({
      businessId: business.id,
      partyId: customer.id,
      lines: [{ itemId: goods.id, quantity: '1' }],
    });

    // A Draft has no archive and never will — that is a NOT_FOUND, not an
    // INTERNAL_ERROR a client can only read as "the request could not be completed".
    await expect(orders.readPdf(draft.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('answers ARCHIVE_UNAVAILABLE, not a re-render, when the filed bytes are gone', async () => {
    const { business, customer } = await givenDraftableOrder();
    const goods = await givenItem({ itemType: 'FINISHED_GOOD' });
    await stock.open({ itemId: goods.id, quantity: '5' }, {}, null);

    const draft = await orders.createDraft({
      businessId: business.id,
      partyId: customer.id,
      lines: [{ itemId: goods.id, quantity: '1' }],
    });
    const issued = await orders.issue(draft.id, {}, null);

    const row = await prisma.document.findUniqueOrThrow({
      where: { id: issued.id },
      select: { archivePath: true },
    });
    expect(row.archivePath).not.toBeNull();

    // Simulate losing the file (a host swap, an ephemeral root, a bad restore).
    await rm(row.archivePath!, { force: true });

    // The old fallback re-rendered here, and on a browser-less deployment the
    // Chromium launch escaped as INTERNAL_ERROR. The honest answer is typed.
    await expect(orders.readPdf(draft.id)).rejects.toMatchObject({
      code: 'ARCHIVE_UNAVAILABLE',
    });
  });
});

describe('cancellation and the open-orders list', () => {
  it('releases every open Reservation in the same transaction as the status change', async () => {
    const { business, customer } = await givenDraftableOrder();
    const goods = await givenItem({ itemType: 'FINISHED_GOOD' });
    await stock.open({ itemId: goods.id, quantity: '10' }, {}, null);

    const draft = await orders.createDraft({
      businessId: business.id,
      partyId: customer.id,
      lines: [{ itemId: goods.id, quantity: '4' }],
    });
    const issued = await orders.issue(draft.id, {}, null);
    expect(
      (await stock.positions(prismaService, [goods.id])).get(goods.id)!.reserved.toString(),
    ).toBe('4');

    const cancelled = await orders.cancel(issued.id, {}, null);

    expect(cancelled.status).toBe('CANCELLED');
    const reservations = await prisma.reservation.findMany({ where: { salesOrderId: issued.id } });
    expect(reservations[0]?.releasedAt).not.toBeNull();
    // The stock is sellable again the moment the promise ends.
    const position = await stock.positions(prismaService, [goods.id]);
    expect(position.get(goods.id)!.reserved.toString()).toBe('0');
    expect(position.get(goods.id)!.available.toString()).toBe('10');
  });

  it('lists an issued, not-fully-delivered order and drops a cancelled one', async () => {
    const { business, customer } = await givenDraftableOrder();
    const item = await givenItem({ itemType: 'FINISHED_GOOD' });
    await stock.open({ itemId: item.id, quantity: '10' }, {}, null);

    const openDraft = await orders.createDraft({
      businessId: business.id,
      partyId: customer.id,
      lines: [{ itemId: item.id, quantity: '2' }],
    });
    await orders.issue(openDraft.id, {}, null);

    const closedDraft = await orders.createDraft({
      businessId: business.id,
      partyId: customer.id,
      lines: [{ itemId: item.id, quantity: '1' }],
    });
    const closed = await orders.issue(closedDraft.id, {}, null);
    await orders.cancel(closed.id, {}, null);

    const open = await orders.listOpenOrders();
    expect(open.map((order) => order.id)).toEqual([openDraft.id]);
  });

  it('audits the issued order', async () => {
    const { business, customer } = await givenDraftableOrder();
    const goods = await givenItem({ itemType: 'FINISHED_GOOD' });
    await stock.open({ itemId: goods.id, quantity: '10' }, {}, null);

    const draft = await orders.createDraft({
      businessId: business.id,
      partyId: customer.id,
      lines: [{ itemId: goods.id, quantity: '1' }],
    });
    const issued = await orders.issue(draft.id, { id: 'user-1', email: 'u@test' }, '127.0.0.1');

    const entry = await prisma.auditEntry.findFirstOrThrow({
      where: { action: 'sales-order.issued', entityId: issued.id },
    });
    expect(entry.actorId).toBe('user-1');
    expect(entry.before).toMatchObject({ status: 'DRAFT' });
  });
});
