/**
 * The Credit Note flow (spec 001 stories 63–69; ADR 0006, ADR 0016, ADR 0017).
 *
 * A Credit Note is the *only* correction for an Issued invoice, so the invariants
 * that matter are the ones that make it trustworthy: it reverses the Invoice's
 * stored figures rather than the Item's current price, it can never overdraw a
 * line, it never moves stock (ADR 0017), and it is drafted before it is numbered.
 *
 * The draft edit is covered here too, because it is the one write that could
 * quietly break the overdraw guard: an edit re-derives the reversal from the
 * Invoice, so a second edit cannot stack on the first.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { AuditService } from '../../audit/audit.service.js';
import { prisma, resetDatabase } from '../../identity/__tests__/harness.js';
import { DocumentNumberingService } from '../../numbering/document-numbering.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { LabelService } from '../../settings/label.service.js';
import { CustomerInvoiceService } from '../customer-invoice.service.js';
import { CreditNoteService } from '../credit-note.service.js';

const prismaService = new PrismaService();
const numbering = new DocumentNumberingService(prismaService);
const audit = new AuditService(prismaService);

let invoices: CustomerInvoiceService;
let creditNotes: CreditNoteService;

beforeEach(async () => {
  await resetDatabase();
  invoices = new CustomerInvoiceService(
    prismaService,
    numbering,
    new LabelService(prismaService, audit),
    audit,
  );
  creditNotes = new CreditNoteService(
    prismaService,
    numbering,
    new LabelService(prismaService, audit),
    audit,
  );
});

afterAll(async () => {
  await prismaService.$disconnect();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let sequence = 0;

async function givenIssuedInvoice(quantity = '3', unitPrice = '100') {
  sequence += 1;
  const business = await prisma.business.create({
    data: {
      legalName: 'Société Générale de Tutorat',
      displayName: 'SGT',
      taxIdentifier: '1234567/A/M/000',
      countryCode: 'TN',
    },
  });
  const customer = await prisma.party.create({
    data: {
      code: `C-${sequence}`,
      name: 'Atlas Trading',
      roles: ['CUSTOMER'],
      taxIdentifier: `9876543/B/M/000-${sequence}`,
    },
  });
  const unit = await prisma.unit.create({ data: { code: `U-${sequence}`, allowsFraction: false } });
  const rate = await prisma.taxRate.create({
    data: { code: `STANDARD_19_${sequence}`, rate: 19 },
  });
  const item = await prisma.item.create({
    data: {
      code: `SAV-${sequence}`,
      name: 'Cours de soutien',
      itemType: 'SERVICE',
      baseUnitId: unit.id,
      taxRateId: rate.id,
      salePrice: unitPrice,
    },
  });

  const draft = await invoices.createDraft({
    businessId: business.id,
    partyId: customer.id,
    locale: 'fr',
    lines: [{ itemId: item.id, quantity }],
  });
  const issued = await invoices.issue(draft.id);
  const line = await prisma.documentLine.findFirstOrThrow({ where: { documentId: issued.id } });

  return { business, customer, item, issued, line };
}

async function givenDraftNote(quantity = '1') {
  const { business, issued, line, item } = await givenIssuedInvoice('3');

  const draft = await creditNotes.createDraft({
    businessId: business.id,
    invoiceId: issued.id,
    lines: [{ invoiceLineId: line.id, quantity }],
  });

  return { business, issued, line, item, draft };
}

// ---------------------------------------------------------------------------

describe('drafting a Credit Note', () => {
  it('reverses the Invoice line’s stored figures, signed negative', async () => {
    const { draft, line } = await givenDraftNote('2');

    const stored = await prisma.document.findUniqueOrThrow({
      where: { id: draft.id },
      include: { lines: { orderBy: { position: 'asc' } }, taxes: true },
    });

    expect(stored.status).toBe('DRAFT');
    // No number until it is issued (ADR 0006).
    expect(stored.number).toBeNull();
    expect(stored.lines).toHaveLength(1);
    expect(stored.lines[0]?.correctsDocumentLineId).toBe(line.id);
    // 2 × 100.000 at 19 %, printed as a subtraction.
    expect(stored.netAmount.toString()).toBe('-200');
    expect(stored.taxAmount.toString()).toBe('-38');
    expect(stored.grossAmount.toString()).toBe('-238');
  });

  it('uses the Invoice’s price, not the Item’s current one', async () => {
    // The Item price is a fact about today; what the Customer was billed is a fact
    // about the invoice. A correction of the second must not follow the first.
    const { business, issued, line, item } = await givenIssuedInvoice('3', '100');
    await prisma.item.update({ where: { id: item.id }, data: { salePrice: '250' } });

    const draft = await creditNotes.createDraft({
      businessId: business.id,
      invoiceId: issued.id,
      lines: [{ invoiceLineId: line.id, quantity: '1' }],
    });

    const stored = await prisma.document.findUniqueOrThrow({ where: { id: draft.id } });
    expect(stored.netAmount.toString()).toBe('-100');
  });

  it('refuses to overdraw an Invoice line', async () => {
    const { business, issued, line } = await givenIssuedInvoice('3');

    await expect(
      creditNotes.createDraft({
        businessId: business.id,
        invoiceId: issued.id,
        lines: [{ invoiceLineId: line.id, quantity: '4' }],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('counts a previously issued note against the remainder', async () => {
    const { business, issued, line } = await givenIssuedInvoice('3');

    const first = await creditNotes.createDraft({
      businessId: business.id,
      invoiceId: issued.id,
      lines: [{ invoiceLineId: line.id, quantity: '2' }],
    });
    await creditNotes.issue(first.id);

    // 2 of 3 already corrected: one more is fine, two is not.
    await expect(
      creditNotes.createDraft({
        businessId: business.id,
        invoiceId: issued.id,
        lines: [{ invoiceLineId: line.id, quantity: '2' }],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    await expect(
      creditNotes.createDraft({
        businessId: business.id,
        invoiceId: issued.id,
        lines: [{ invoiceLineId: line.id, quantity: '1' }],
      }),
    ).resolves.toMatchObject({ status: 'DRAFT' });
  });

  it('refuses to correct a Draft invoice', async () => {
    const { business, customer, item } = await givenIssuedInvoice();
    const draftInvoice = await invoices.createDraft({
      businessId: business.id,
      partyId: customer.id,
      locale: 'fr',
      lines: [{ itemId: item.id, quantity: '1' }],
    });
    const line = await prisma.documentLine.findFirstOrThrow({
      where: { documentId: draftInvoice.id },
    });

    // There is nothing to correct yet: a draft has no number and may still change.
    await expect(
      creditNotes.createDraft({
        businessId: business.id,
        invoiceId: draftInvoice.id,
        lines: [{ invoiceLineId: line.id, quantity: '1' }],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

describe('editing a Draft Credit Note', () => {
  it('replaces the reversed set and re-derives it from the Invoice', async () => {
    const { draft, line } = await givenDraftNote('1');

    await creditNotes.update(draft.id, { lines: [{ invoiceLineId: line.id, quantity: '3' }] });

    const stored = await prisma.document.findUniqueOrThrow({
      where: { id: draft.id },
      include: { lines: { orderBy: { position: 'asc' } } },
    });
    expect(stored.lines).toHaveLength(1);
    expect(stored.netAmount.toString()).toBe('-300');
    expect(stored.status).toBe('DRAFT');
    expect(stored.number).toBeNull();
  });

  it('does not stack a second edit on the first', async () => {
    // The trap a merged line set would fall into: the second edit would add to the
    // first and the overdraw guard would never see it. It re-derives instead.
    const { draft, line } = await givenDraftNote('3');

    await creditNotes.update(draft.id, { lines: [{ invoiceLineId: line.id, quantity: '3' }] });

    const stored = await prisma.document.findUniqueOrThrow({
      where: { id: draft.id },
      include: { lines: true },
    });
    expect(stored.lines).toHaveLength(1);
    expect(stored.netAmount.toString()).toBe('-300');
  });

  it('still refuses an overdraw after an edit', async () => {
    const { draft, line } = await givenDraftNote('1');

    await expect(
      creditNotes.update(draft.id, { lines: [{ invoiceLineId: line.id, quantity: '4' }] }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('refuses to re-point the Invoice it corrects', async () => {
    // Which Invoice a correction belongs to is the document's identity. A patch that
    // moved it would leave the stored figures quoting one invoice and the row another.
    const { draft } = await givenDraftNote('1');
    const other = await givenIssuedInvoice('1');

    await expect(
      creditNotes.update(draft.id, { invoiceId: other.issued.id }),
    ).rejects.toBeInstanceOf(ZodError);

    const stored = await prisma.document.findUniqueOrThrow({
      where: { id: draft.id },
      include: { creditNotes: true },
    });
    expect(stored.creditNotes[0]?.correctsDocumentId).not.toBe(other.issued.id);
  });

  it('refuses to edit an issued note, and leaves its rows alone', async () => {
    const { draft, line } = await givenDraftNote('2');
    const issued = await creditNotes.issue(draft.id);

    await expect(
      creditNotes.update(issued.id, { lines: [{ invoiceLineId: line.id, quantity: '1' }] }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const stored = await prisma.document.findUniqueOrThrow({ where: { id: issued.id } });
    expect(stored.netAmount.toString()).toBe('-200');
  });
});

describe('issuing a Credit Note', () => {
  it('numbers it in its own series and never moves stock (ADR 0017)', async () => {
    const { draft } = await givenDraftNote('2');

    const issued = await creditNotes.issue(draft.id);

    expect(issued.status).toBe('ISSUED');
    expect(issued.number).toMatch(/^AV-\d{4}-0001$/);
    // A Credit Note is a fiscal correction, not a stock movement: goods are returned
    // by their own Delivery Note, which is what appends a ledger entry.
    expect(await prisma.stockLedgerEntry.count()).toBe(0);
  });
});
