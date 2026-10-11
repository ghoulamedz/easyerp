/**
 * The Customer Invoice flow against a real database.
 *
 * The theme is the one invariant a client cannot be trusted to respect: a document's
 * money is the server's. Every test here either proves the server computed a figure
 * or proves it refused to accept one.
 *
 * Two of these tests would fail against the version of this flow written earlier in
 * the same session, and they are the reason they exist:
 *
 * - `refuses to mutate a line of an issued invoice` — the immutability trigger
 *   guarded the invoice row but not its lines, so every figure the document shows
 *   could be edited after issue by a single UPDATE.
 * - `two concurrent issues receive different numbers` — only holds because the
 *   allocation is one `UPDATE … RETURNING` inside the caller's transaction. The
 *   first version allocated through `this.prisma`, outside that transaction.
 */

import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { DomainError } from '../../common/errors.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { prisma, resetDatabase } from '../../identity/__tests__/harness.js';
import { CustomerInvoiceService } from '../customer-invoice.service.js';
import { DocumentArchive } from '../document-archive.js';
import { DocumentNumberingService } from '../../numbering/document-numbering.service.js';
import { LabelService } from '../../settings/label.service.js';
import { AuditService } from '../../audit/audit.service.js';

const prismaService = new PrismaService();
const numbering = new DocumentNumberingService(prismaService);

let archiveRoot: string;
let archive: DocumentArchive;
let invoices: CustomerInvoiceService;

beforeEach(async () => {
  await resetDatabase();

  // A fresh archive per test, so a leftover PDF from an earlier test cannot make a
  // later one pass.
  archiveRoot = await mkdtemp(join(tmpdir(), 'easyerp-archive-'));
  archive = new DocumentArchive(archiveRoot);
  invoices = new CustomerInvoiceService(
    prismaService,
    numbering,
    archive,
    new LabelService(prismaService, new AuditService(prismaService)),
    new AuditService(prismaService),
  );
});

afterAll(async () => {
  await prismaService.$disconnect();
  await rm(archiveRoot, { force: true, recursive: true });
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

let sequence = 0;

async function givenCustomer() {
  // Unique per call: several tests build more than one document in a single test,
  // and a fixture that collides on `party.code` fails on its own bookkeeping.
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

/** Every fixture row is unique per call, so one test can build several documents. */
async function givenUnit() {
  sequence += 1;
  return prisma.unit.create({ data: { code: `U-${sequence}`, allowsFraction: false } });
}

/** A STANDARD 19 % rate, and an EXEMPT one, so a regime difference is expressible. */
async function givenTaxRates() {
  sequence += 1;
  const standard = await prisma.taxRate.create({
    data: { code: `STANDARD_19_${sequence}`, rate: 19 },
  });
  const exempt = await prisma.taxRate.create({
    data: { code: `EXEMPT_${sequence}`, rate: 0, isStandard: false },
  });
  return { standard, exempt };
}

async function givenItem(overrides: Record<string, unknown> = {}) {
  const unit = await givenUnit();
  const { standard } = await givenTaxRates();

  return prisma.item.create({
    data: {
      code: `SAV-${sequence}`,
      name: 'Cours de soutien',
      description: 'Séance de soutien en maths',
      itemType: 'SERVICE',
      baseUnitId: unit?.id ?? (overrides['baseUnitId'] as string),
      taxRateId: (overrides['taxRateId'] as string) ?? standard!.id,
      salePrice: 100,
      ...overrides,
    },
  });
}

// ---------------------------------------------------------------------------

describe('drafting', () => {
  it('stores the figures the server resolved, and no number', async () => {
    const business = await givenBusiness();
    const customer = await givenCustomer();
    const item = await givenItem();

    const draft = await invoices.createDraft({
      businessId: business.id,
      partyId: customer.id,
      locale: 'fr',
      lines: [{ itemId: item.id, quantity: '3' }],
    });

    const stored = await prisma.document.findUniqueOrThrow({
      where: { id: draft.id },
      include: { lines: true },
    });

    expect(stored.status).toBe('DRAFT');
    // A number exists only once the document is issued (ADR 0006).
    expect(stored.number).toBeNull();
    expect(stored.issuedAt).toBeNull();
    // 3 × 100.000 at 19 % → 300.000 + 57.000.
    expect(stored.netAmount.toString()).toBe('300');
    expect(stored.taxAmount.toString()).toBe('57');
    expect(stored.grossAmount.toString()).toBe('357');
    expect(stored.lines[0]?.unitPrice.toString()).toBe('100');
  });

  it('refuses a body that carries its own price', async () => {
    const business = await givenBusiness();
    const customer = await givenCustomer();
    const item = await givenItem();

    // `draftCustomerInvoiceSchema` is a strictObject. A client able to price its own
    // document could forge an invoice, and silently dropping the field would hide
    // the attempt from whoever reads the audit trail later.
    await expect(
      invoices.createDraft({
        businessId: business.id,
        partyId: customer.id,
        locale: 'fr',
        lines: [{ itemId: item.id, quantity: '3', unitPrice: '0.010' }],
      }),
    ).rejects.toMatchObject({ name: 'ZodError' });

    expect(await prisma.document.count()).toBe(0);
  });

  it('refuses a Party that is not an active Customer', async () => {
    const business = await givenBusiness();
    const customer = await givenCustomer();
    const item = await givenItem();

    await prisma.party.update({ where: { id: customer.id }, data: { isActive: false } });

    await expect(
      invoices.createDraft({
        businessId: business.id,
        partyId: customer.id,
        locale: 'fr',
        lines: [{ itemId: item.id, quantity: '1' }],
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });
});

describe('issuing', () => {
  async function givenDraft(quantity = '3') {
    const business = await givenBusiness();
    const customer = await givenCustomer();
    const item = await givenItem();
    const draft = await invoices.createDraft({
      businessId: business.id,
      partyId: customer.id,
      locale: 'fr',
      lines: [{ itemId: item.id, quantity }],
    });
    return { business, customer, item, draft };
  }

  it('numbers the document, stamps it, and archives a PDF that exists on disk', async () => {
    const { draft } = await givenDraft();

    const issued = await invoices.issue(draft.id);

    expect(issued.status).toBe('ISSUED');
    expect(issued.number).toMatch(/^FA-\d{4}-0001$/);
    expect(issued.issuedAt).not.toBeNull();
    expect(issued.totals.grossAmount).toBe('357');

    // The archival copy is a real file, and the hash beside it describes those bytes.
    expect(issued.archive).not.toBeNull();
    expect(issued.archive?.path).toContain(
      join('CUSTOMER_INVOICE', String(new Date().getUTCFullYear())),
    );
    const onDisk = await stat(issued.archive!.path);
    expect(onDisk.size).toBe(issued.archive!.byteLength);
    expect(onDisk.size).toBeGreaterThan(0);
    expect(issued.archive?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('serves the same bytes it archived', async () => {
    const { draft } = await givenDraft();

    const issued = await invoices.issue(draft.id);
    const { pdf, sha256 } = await invoices.readArchive(draft.id);

    expect(pdf.byteLength).toBe(issued.archive!.byteLength);
    // The point of storing the hash: a client can tell whether what it holds is
    // what the Business still serves.
    expect(sha256).toBe(issued.archive!.sha256);
    // A PDF, not an HTML error page.
    expect(pdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
  });

  it('honours the stored Number Pattern padding', async () => {
    // The default is 4 digits. Padding lives in a row, not in code, so it must
    // reach the document without a deploy.
    await prisma.numberPattern.create({
      data: { code: 'CUSTOMER_INVOICE', pattern: 'FA-{year}-{seq}', padding: 7 },
    });
    const { draft } = await givenDraft();

    const issued = await invoices.issue(draft.id);

    expect(issued.number).toMatch(/^FA-\d{4}-0000001$/);
  });

  it('re-prices at issue, so a price changed after drafting is reflected', async () => {
    const business = await givenBusiness();
    const customer = await givenCustomer();
    const item = await givenItem({ salePrice: 100 });

    const draft = await invoices.createDraft({
      businessId: business.id,
      partyId: customer.id,
      locale: 'fr',
      lines: [{ itemId: item.id, quantity: '2' }],
    });
    // The draft is a reviewable document, so it shows what it showed when drafted.
    expect((await invoices.findById(draft.id))?.totals.grossAmount).toBe('238');

    await prisma.item.update({ where: { id: item.id }, data: { salePrice: 200 } });

    const issued = await invoices.issue(draft.id);

    // 2 × 200 at 19 % → 400 + 76.
    expect(issued.totals.netAmount).toBe('400');
    expect(issued.totals.taxAmount).toBe('76');
    expect(issued.totals.grossAmount).toBe('476');
  });

  it('refuses to issue an invoice that is already issued', async () => {
    const { draft } = await givenDraft();
    await invoices.issue(draft.id);

    await expect(invoices.issue(draft.id)).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
    });

    // One number consumed, not two.
    expect(await prisma.document.count()).toBe(1);
  });

  it('refuses to issue against a deactivated Item', async () => {
    const { item, draft } = await givenDraft();
    await prisma.item.update({ where: { id: item.id }, data: { isActive: false } });

    await expect(invoices.issue(draft.id)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      status: 422,
    });

    // The transaction rolled back, so the draft never became an issued document
    // and never consumed a number.
    const stored = await prisma.document.findUniqueOrThrow({ where: { id: draft.id } });
    expect(stored.status).toBe('DRAFT');
    expect(stored.number).toBeNull();
  });

  it('two concurrent issues receive different numbers', async () => {
    const business = await givenBusiness();
    const customer = await givenCustomer();
    const item = await givenItem();

    const drafts = await Promise.all(
      Array.from({ length: 2 }, () =>
        invoices.createDraft({
          businessId: business.id,
          partyId: customer.id,
          locale: 'fr',
          lines: [{ itemId: item.id, quantity: '1' }],
        }),
      ),
    );

    const issued = await Promise.all(drafts.map((draft) => invoices.issue(draft.id)));

    const numbers = issued.map((invoice) => invoice.number).sort();

    expect(new Set(numbers).size).toBe(2);
    // Distinct *and* consecutive: a locking bug that made both transactions read
    // the same value would still pass `new Set(...).size === 2` if it then skipped.
    expect(numbers).toEqual([
      `FA-${new Date().getUTCFullYear()}-0001`,
      `FA-${new Date().getUTCFullYear()}-0002`,
    ]);
  });

  it('leaves no gap when an issue fails after the number was allocated', async () => {
    const business = await givenBusiness();
    const customer = await givenCustomer();
    const item = await givenItem();

    const first = await invoices.createDraft({
      businessId: business.id,
      partyId: customer.id,
      locale: 'fr',
      lines: [{ itemId: item.id, quantity: '1' }],
    });
    expect((await invoices.issue(first.id)).number).toMatch(/-0001$/);

    // The Item is deactivated *after* the draft exists, so the failure happens
    // inside the issuing transaction — and after the series has been advanced,
    // because allocation is the first thing `issue` does.
    const second = await invoices.createDraft({
      businessId: business.id,
      partyId: customer.id,
      locale: 'fr',
      lines: [{ itemId: item.id, quantity: '1' }],
    });
    await prisma.item.update({ where: { id: item.id }, data: { isActive: false } });

    await expect(invoices.issue(second.id)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    // The series advanced and then unwound with the transaction that failed.
    expect(await prisma.numberSeries.count({ where: { code: 'CUSTOMER_INVOICE' } })).toBe(1);
    expect((await prisma.numberSeries.findFirstOrThrow()).nextValue).toBe(2);

    await prisma.item.update({ where: { id: item.id }, data: { isActive: true } });
    const reissued = await invoices.issue(second.id);

    // Gaps in a fiscal series are a legal problem, not a cosmetic one. 0002 follows
    // 0001 with nothing consumed in between.
    expect(reissued.number).toMatch(/-0002$/);
  });
});

describe('immutability of an issued document', () => {
  async function givenIssued() {
    const business = await givenBusiness();
    const customer = await givenCustomer();
    const item = await givenItem();
    const draft = await invoices.createDraft({
      businessId: business.id,
      partyId: customer.id,
      locale: 'fr',
      lines: [{ itemId: item.id, quantity: '3' }],
    });
    await invoices.issue(draft.id);
    return { draft, item };
  }

  it('refuses to change the totals', async () => {
    const { draft } = await givenIssued();

    await expect(
      prisma.document.update({
        where: { id: draft.id },
        data: { grossAmount: '1' },
      }),
    ).rejects.toThrow(/immutable/);
  });

  it('refuses to mutate a line of an issued invoice', async () => {
    // This is the hole a parent-only trigger leaves open: the invoice row is
    // guarded, the lines are not, and the lines carry every figure the document
    // shows. A single UPDATE edits the invoice the client already received.
    const { draft } = await givenIssued();
    const line = await prisma.documentLine.findFirstOrThrow({
      where: { documentId: draft.id },
    });

    await expect(
      prisma.documentLine.update({
        where: { id: line.id },
        data: { unitPrice: '0.010', grossAmount: '0.010' },
      }),
    ).rejects.toThrow(/immutable/);

    await expect(prisma.documentLine.delete({ where: { id: line.id } })).rejects.toThrow(
      /immutable/,
    );
  });

  it('refuses to delete an issued invoice', async () => {
    const { draft } = await givenIssued();

    await expect(prisma.document.delete({ where: { id: draft.id } })).rejects.toThrow(/immutable/);
  });

  it('still allows the archive columns to be written', async () => {
    // The one concession: the number must commit before the PDF can be written,
    // because the file name is the number. A trigger that forbade this would make
    // archiving impossible.
    const { draft } = await givenIssued();

    await expect(
      prisma.document.update({
        where: { id: draft.id },
        data: { archivePath: '/tmp/regenerated.pdf', archivedAt: new Date() },
      }),
    ).resolves.toBeTruthy();
  });
});
