/**
 * The Delivery Note flow against a real database (spec 001 stories 46–48).
 *
 * The note is where a promise stops being words: issuing one moves physical
 * stock out of the ledger and grows the order's Reservations. The three
 * refusals proven here are the ones a UI hides and only the ledger can reveal —
 * shipping more than the order opened, shipping an order line twice, and taking
 * on-hand below zero.
 */

import { rm } from 'node:fs/promises';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuditService } from '../../audit/audit.service.js';
import { StockLedgerService } from '../../inventory/stock-ledger.service.js';
import { prisma, resetDatabase } from '../../identity/__tests__/harness.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DeliveryNoteService } from '../delivery-note.service.js';
import { DocumentArchive } from '../document-archive.js';
import { DocumentNumberingService } from '../../numbering/document-numbering.service.js';
import { PaperPdfService } from '../../documents/paper-pdf.service.js';
import { SalesOrderService } from '../sales-order.service.js';

const prismaService = new PrismaService();
const numbering = new DocumentNumberingService(prismaService);
const audit = new AuditService(prismaService);
const stock = new StockLedgerService(prismaService, audit);
// A scratch archive root: the issue tests render-and-archive on the side, and a
// failure there is caught by the issue path, never surfaced as a test failure.
// It is emptied before every test because a write to the archive is immutable
// (`wx`): a leftover file would make the next test's archive step fail.
const ARCHIVE_ROOT = '/tmp/easyerp-api-spec-archive';
const paperPdfs = new PaperPdfService(prismaService, new DocumentArchive(ARCHIVE_ROOT));
const orders = new SalesOrderService(prismaService, numbering, stock, audit, paperPdfs);
const deliveryNotes = new DeliveryNoteService(prismaService, numbering, stock, audit, paperPdfs);

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  await rm(ARCHIVE_ROOT, { force: true, recursive: true });
});

afterAll(async () => {
  await prismaService.$disconnect();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let sequence = 0;

async function givenBusiness() {
  return prisma.business.create({
    data: {
      legalName: 'Société Générale de Tutorat',
      displayName: 'SGT',
      taxIdentifier: '1234567/A/M/000',
      countryCode: 'TN',
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

async function givenItem(itemType = 'FINISHED_GOOD') {
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
    },
  });
}

/** An issued order for `quantity` of one goods Item, with 10.000 opened on-hand. */
async function givenIssuedOrder(quantity: string) {
  const business = await givenBusiness();
  const customer = await givenCustomer();
  const item = await givenItem();
  await stock.open({ itemId: item.id, quantity: '10' }, {}, null);

  const draft = await orders.createDraft({
    businessId: business.id,
    partyId: customer.id,
    lines: [{ itemId: item.id, quantity }],
  });
  const issued = await orders.issue(draft.id, {}, null);
  // The contract response does not carry line ids; the note's `salesOrderLineId`
  // is the real document line the Reservation bookkeeping is keyed on.
  const orderLine = await prisma.documentLine.findFirstOrThrow({
    where: { documentId: issued.id },
  });
  return { business, customer, item, issued, orderLine };
}

// ---------------------------------------------------------------------------

describe('drafting a Delivery Note', () => {
  it('defaults the recipient to the order’s Customer', async () => {
    const { business, customer, issued, orderLine } = await givenIssuedOrder('4');

    const draft = await deliveryNotes.createDraft({
      businessId: business.id,
      salesOrderId: issued.id,
      lines: [{ itemId: orderLine.itemId, quantity: '2', salesOrderLineId: orderLine.id }],
    });

    const stored = await prisma.document.findUniqueOrThrow({
      where: { id: draft.id },
      include: { deliveryNotes: { include: { lines: true } } },
    });

    expect(stored.partyId).toBe(customer.id);
    expect(stored.status).toBe('DRAFT');
    expect(stored.number).toBeNull();
    const child = stored.deliveryNotes[0]!;
    expect(child.salesOrderId).toBe(issued.id);
    expect(child.lines[0]?.salesOrderLineId).toBe(orderLine.id);
    expect(child.lines[0]?.description).toBe('Séance de soutien en maths');
  });

  it('refuses a different Customer than the order it fulfils', async () => {
    const { business, issued, orderLine } = await givenIssuedOrder('4');
    const other = await givenCustomer();

    await expect(
      deliveryNotes.createDraft({
        businessId: business.id,
        partyId: other.id,
        salesOrderId: issued.id,
        lines: [{ itemId: orderLine.itemId, quantity: '2', salesOrderLineId: orderLine.id }],
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('refuses a line whose order line does not belong to the order', async () => {
    const { business, issued } = await givenIssuedOrder('4');
    const stranger = await givenIssuedOrder('1');

    await expect(
      deliveryNotes.createDraft({
        businessId: business.id,
        salesOrderId: issued.id,
        lines: [
          {
            itemId: stranger.orderLine.itemId,
            quantity: '1',
            salesOrderLineId: stranger.orderLine.id,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

describe('issuing a Delivery Note', () => {
  it('moves goods out of the ledger and grows the Reservation', async () => {
    const { business, item, issued, orderLine } = await givenIssuedOrder('4');

    const draft = await deliveryNotes.createDraft({
      businessId: business.id,
      salesOrderId: issued.id,
      lines: [{ itemId: orderLine.itemId, quantity: '2', salesOrderLineId: orderLine.id }],
    });
    const note = await deliveryNotes.issue(draft.id, {}, null);

    expect(note.status).toBe('ISSUED');
    expect(note.number).toMatch(/^BL-\d{4}-0001$/);
    expect(note.salesOrderNumber).toBe(issued.number);

    // 10.000 opened → one OUT of 2.000.
    const entries = await prisma.stockLedgerEntry.findMany({
      where: { itemId: item.id },
      orderBy: { seq: 'asc' },
    });
    expect(entries).toHaveLength(2);
    expect(entries[1]?.reason).toBe('DELIVERY_NOTE');
    expect(entries[1]?.direction).toBe('OUT');
    expect(entries[1]?.quantity.toString()).toBe('2');
    expect(entries[1]?.balanceAfter.toString()).toBe('8');
    expect(entries[1]?.documentType).toBe('DELIVERY_NOTE');

    const reservation = await prisma.reservation.findFirstOrThrow({
      where: { salesOrderId: issued.id },
    });
    expect(reservation.deliveredQuantity.toString()).toBe('2');
    expect(reservation.releasedAt).toBeNull(); // 2 of 4 delivered; still open.

    const position = await stock.positions(prismaService, [item.id]);
    expect(position.get(item.id)!.available.toString()).toBe('6');
  });

  it('releases the Reservation once delivered in full', async () => {
    const { business, issued, orderLine } = await givenIssuedOrder('2');

    const first = await deliveryNotes.createDraft({
      businessId: business.id,
      salesOrderId: issued.id,
      lines: [{ itemId: orderLine.itemId, quantity: '2', salesOrderLineId: orderLine.id }],
    });
    await deliveryNotes.issue(first.id, {}, null);

    const reservation = await prisma.reservation.findFirstOrThrow({
      where: { salesOrderId: issued.id },
    });
    expect(reservation.deliveredQuantity.toString()).toBe('2');
    expect(reservation.releasedAt).not.toBeNull();

    // A released order is no longer open.
    expect(await orders.listOpenOrders()).toHaveLength(0);
  });

  it('refuses to over-deliver an order line', async () => {
    const { business, issued, orderLine } = await givenIssuedOrder('4');

    const draft = await deliveryNotes.createDraft({
      businessId: business.id,
      salesOrderId: issued.id,
      lines: [{ itemId: orderLine.itemId, quantity: '5', salesOrderLineId: orderLine.id }],
    });

    await expect(deliveryNotes.issue(draft.id, {}, null)).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
    });

    // Nothing moved: the ledger is untouched, the note is still a Draft.
    expect(await prisma.stockLedgerEntry.count()).toBe(1); // only the opening balance
    const stored = await prisma.document.findUniqueOrThrow({ where: { id: draft.id } });
    expect(stored.status).toBe('DRAFT');
  });

  it('refuses to ship an order line that is already fully delivered', async () => {
    const { business, issued, orderLine } = await givenIssuedOrder('2');
    const first = await deliveryNotes.createDraft({
      businessId: business.id,
      salesOrderId: issued.id,
      lines: [{ itemId: orderLine.itemId, quantity: '2', salesOrderLineId: orderLine.id }],
    });
    await deliveryNotes.issue(first.id, {}, null);

    const second = await deliveryNotes.createDraft({
      businessId: business.id,
      salesOrderId: issued.id,
      lines: [{ itemId: orderLine.itemId, quantity: '1', salesOrderLineId: orderLine.id }],
    });

    await expect(deliveryNotes.issue(second.id, {}, null)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('refuses to issue a note twice', async () => {
    const { business, issued, orderLine } = await givenIssuedOrder('4');
    const draft = await deliveryNotes.createDraft({
      businessId: business.id,
      salesOrderId: issued.id,
      lines: [{ itemId: orderLine.itemId, quantity: '4', salesOrderLineId: orderLine.id }],
    });
    await deliveryNotes.issue(draft.id, {}, null);

    await expect(deliveryNotes.issue(draft.id, {}, null)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(await prisma.stockLedgerEntry.count({ where: { reason: 'DELIVERY_NOTE' } })).toBe(1);
  });

  it('archives the quantities-only paper and serves those same bytes back', async () => {
    // A Delivery Note quotes quantities, never prices: an operational note that
    // printed a price it never charged would be a wrong paper.
    const { business, issued, orderLine } = await givenIssuedOrder('4');
    const draft = await deliveryNotes.createDraft({
      businessId: business.id,
      salesOrderId: issued.id,
      lines: [{ itemId: orderLine.itemId, quantity: '2', salesOrderLineId: orderLine.id }],
    });
    const note = await deliveryNotes.issue(draft.id, {}, null);

    const { pdf, sha256 } = await deliveryNotes.readPdf(note.id);
    expect(pdf.subarray(0, 4).toString('latin1')).toBe('%PDF');

    const row = await prisma.document.findUniqueOrThrow({
      where: { id: note.id },
      select: { archiveSha256: true, archivedAt: true },
    });
    expect(row.archivedAt).not.toBeNull();
    expect(sha256).toBe(row.archiveSha256);
  });

  it('refuses to serve a paper for a note that was never issued', async () => {
    const { business, issued, orderLine } = await givenIssuedOrder('4');
    const draft = await deliveryNotes.createDraft({
      businessId: business.id,
      salesOrderId: issued.id,
      lines: [{ itemId: orderLine.itemId, quantity: '1', salesOrderLineId: orderLine.id }],
    });

    await expect(deliveryNotes.readPdf(draft.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('stands alone: a note without an order ships independent stock', async () => {
    const business = await givenBusiness();
    const customer = await givenCustomer();
    const item = await givenItem();
    await stock.open({ itemId: item.id, quantity: '5' }, {}, null);

    const draft = await deliveryNotes.createDraft({
      businessId: business.id,
      partyId: customer.id,
      lines: [{ itemId: item.id, quantity: '2' }],
    });
    const note = await deliveryNotes.issue(draft.id, {}, null);

    expect(note.salesOrderId).toBeNull();
    expect(note.salesOrderNumber).toBeNull();
    expect(
      (await stock.positions(prismaService, [item.id])).get(item.id)!.available.toString(),
    ).toBe('3');
  });

  it('ships nothing for a service line', async () => {
    const business = await givenBusiness();
    const customer = await givenCustomer();
    const service = await givenItem('SERVICE');

    const draft = await deliveryNotes.createDraft({
      businessId: business.id,
      partyId: customer.id,
      lines: [{ itemId: service.id, quantity: '1' }],
    });
    const note = await deliveryNotes.issue(draft.id, {}, null);

    expect(await prisma.stockLedgerEntry.count()).toBe(0);
    expect(note.lines[0]?.itemId).toBe(service.id);
  });

  it('refuses a note that would take on-hand below zero', async () => {
    const business = await givenBusiness();
    const customer = await givenCustomer();
    const item = await givenItem();
    await stock.open({ itemId: item.id, quantity: '2' }, {}, null);

    const draft = await deliveryNotes.createDraft({
      businessId: business.id,
      partyId: customer.id,
      lines: [{ itemId: item.id, quantity: '3' }],
    });

    await expect(deliveryNotes.issue(draft.id, {}, null)).rejects.toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      status: 409,
    });
  });
});
