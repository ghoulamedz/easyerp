/**
 * The Credit Note flow (spec 001 stories 63–69; ADR 0006, ADR 0016, ADR 0017).
 *
 * A Credit Note corrects an Issued Customer Invoice, in whole or in part. The
 * client says *what and how much* of an Invoice line to reverse
 * (`invoiceLineId` + a strictly positive quantity); the price, the tax rate and
 * every amount are the Invoice line's stored figures, never the Item's current
 * ones — a price changed after billing must not alter the correction of what
 * was billed. All arithmetic is exact `Amount` math (ADR 0005), then negated:
 * a Credit Note line is printed as a subtraction.
 *
 * Two guards shape the flow. *No overdraw*: the corrected quantity of an
 * Invoice line across every Credit Note — drafts included, since a draft
 * becomes issued — never exceeds what the Invoice billed. *No stock*: issuing
 * appends nothing to the Stock Ledger (ADR 0017); a return of goods is its own
 * stock act with `reason: RETURN_IN`.
 */

import { Injectable } from '@nestjs/common';

import {
  creditNoteUpdateSchema,
  documentStatusSchema,
  draftCreditNoteSchema,
  localeSchema,
  money,
  rate,
  signedQuantitySchema,
  vatRegimeSchema,
  type CreditNote as CreditNoteResponse,
} from '@easyerp/contracts';

import { AuditService, type AuditActor } from '../audit/audit.service.js';
import {
  conflict,
  invariant,
  notFound,
  validationFailed,
} from '../common/errors.js';
import { Amount } from '../finance/amount.js';
import { printInvoiceCopy } from '../finance/print-copy.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LabelService } from '../settings/label.service.js';
import { DocumentNumberingService } from '../numbering/document-numbering.service.js';

export const CREDIT_NOTE = 'CREDIT_NOTE';

interface ReversalRow {
  readonly itemId: string;
  readonly unitOfMeasureId: string;
  readonly description: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly taxRate: string;
  readonly netAmount: string;
  /** The Invoice line's stored FODEC figure carried pro-rata, never re-derived. */
  readonly fodecAmount: string;
  readonly taxAmount: string;
  readonly grossAmount: string;
  readonly correctsDocumentLineId: string;
}

/**
 * Pro-rata reversal figures for one requested correction. The unit price, the
 * tax rate and the FODEC figure are the Invoice line's stored figures; only
 * the quantity is new. Everything is negated before it is stored.
 *
 * The FODEC figure is the stored line figure carried pro-rata — never
 * re-derived from the Item's current flag, so a flag changed after billing
 * cannot alter the correction of what was billed. The billed quantity is
 * strictly positive (contracts `quantitySchema`), so the pro-rata divisor is
 * never zero.
 */
function reversalOf(
  invoiceLine: { unitPrice: string; taxRate: string; fodecAmount: string; quantity: string },
  reverseQuantity: string,
): Omit<ReversalRow, 'itemId' | 'unitOfMeasureId' | 'description' | 'correctsDocumentLineId'> {
  const net = Amount.parse(invoiceLine.unitPrice).timesQuantity(reverseQuantity);
  const fodec = Amount.parse(invoiceLine.fodecAmount)
    .timesQuantity(reverseQuantity)
    .divide(invoiceLine.quantity);
  // The VAT base is net + FODEC, exactly as `priceLine` prices a subject line
  // (finance/pricing.ts): the tax is on the base, and the gross is base + tax.
  const base = net.plus(fodec);
  const tax = base.timesRate(invoiceLine.taxRate);
  const gross = base.plus(tax);
  return {
    quantity: Amount.parse(reverseQuantity).negated().toString(),
    unitPrice: invoiceLine.unitPrice,
    taxRate: invoiceLine.taxRate,
    netAmount: net.negated().toString(),
    fodecAmount: fodec.negated().toString(),
    taxAmount: tax.negated().toString(),
    grossAmount: gross.negated().toString(),
  };
}

type PrismaClient = Pick<PrismaService, 'document' | 'documentLine' | '$executeRaw'>;

/**
 * Quantities already corrected per Invoice line, as positive magnitudes.
 *
 * `exceptDocumentId` is the note being *edited*. Its own stored lines are the
 * correction this edit is replacing, so counting them would make every edit see its
 * previous figures as somebody else's and refuse to grow — the one direction an edit
 * exists for. Other drafts still count: two drafts correcting the same remainder
 * should produce one Issued note and one clear refusal.
 */
async function creditedByLine(
  client: Pick<PrismaService, 'documentLine'>,
  invoiceLineIds: readonly string[],
  exceptDocumentId?: string,
): Promise<Map<string, Amount>> {
  const rows = await client.documentLine.findMany({
    where: {
      correctsDocumentLineId: { in: [...invoiceLineIds] },
      ...(exceptDocumentId === undefined ? {} : { documentId: { not: exceptDocumentId } }),
    },
    select: { correctsDocumentLineId: true, quantity: true },
  });
  const credited = new Map<string, Amount>();
  for (const row of rows) {
    if (!row.correctsDocumentLineId) continue;
    // Stored negated; the magnitude is what was already corrected.
    const magnitude = Amount.parse(row.quantity.toString()).negated();
    const previous = credited.get(row.correctsDocumentLineId) ?? Amount.zero();
    credited.set(row.correctsDocumentLineId, previous.plus(magnitude));
  }
  return credited;
}

@Injectable()
export class CreditNoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: DocumentNumberingService,
    private readonly labels: LabelService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Draft a correction. No number — a number exists only once the document is
   * Issued (ADR 0006) — but real (negative) prices, so it can be reviewed.
   */
  async createDraft(
    payload: unknown,
    actor: AuditActor = {},
    ipAddress?: string | null,
  ): Promise<{ id: string; status: string }> {
    // `.parse`, not `.safeParse`: the schema is a `strictObject`, so a request
    // carrying money is rejected with the field named (ADR 0005).
    const input = draftCreditNoteSchema.parse(payload);

    const invoice = await this.prisma.document.findFirst({
      where: { id: input.invoiceId, type: 'CUSTOMER_INVOICE' },
      include: { lines: { orderBy: { position: 'asc' } } },
    });
    if (!invoice) throw notFound('Customer Invoice', input.invoiceId);
    if (invoice.status !== 'ISSUED') {
      throw validationFailed('A Credit Note must correct an Issued Invoice.', {
        invoiceId: input.invoiceId,
      });
    }

    const business = await this.prisma.business.findUnique({ where: { id: input.businessId } });
    if (!business) throw notFound('Business', input.businessId);

    const customerParty = await this.prisma.party.findFirst({
      where: { id: invoice.partyId, isActive: true, roles: { has: 'CUSTOMER' } },
    });
    if (!customerParty) {
      throw validationFailed(`No active Party ${invoice.partyId} holding the CUSTOMER role.`, {
        partyId: invoice.partyId,
      });
    }

    const rows = await this.reversalRows(input.invoiceId, input.lines);

    const taxGroups = new Map<string, { base: Amount; amount: Amount }>();
    for (const row of rows) {
      const group = taxGroups.get(row.taxRate) ?? { base: Amount.zero(), amount: Amount.zero() };
      group.base = group.base.plus(Amount.parse(row.netAmount));
      group.amount = group.amount.plus(Amount.parse(row.taxAmount));
      taxGroups.set(row.taxRate, group);
    }

    const created = await this.prisma.document.create({
      data: {
        type: CREDIT_NOTE,
        status: 'DRAFT',
        businessId: business.id,
        partyId: customerParty.id,
        locale: invoice.locale,
        vatRegime: business.vatRegime,
        currency: business.currency,
        netAmount: sumOf(rows.map((row) => row.netAmount)),
        taxAmount: sumOf(rows.map((row) => row.taxAmount)),
        grossAmount: sumOf(rows.map((row) => row.grossAmount)),
        lines: {
          create: rows.map((row, position) => ({
            position,
            itemId: row.itemId,
            unitOfMeasureId: row.unitOfMeasureId,
            description: row.description,
            quantity: row.quantity,
            unitPrice: row.unitPrice,
            taxRate: row.taxRate,
            netAmount: row.netAmount,
            fodecAmount: row.fodecAmount,
            taxAmount: row.taxAmount,
            grossAmount: row.grossAmount,
            correctsDocumentLineId: row.correctsDocumentLineId,
          })),
        },
        taxes: {
          create: [...taxGroups].map(([rateValue, group], position) => ({
            position,
            rate: rateValue,
            base: group.base.toString(),
            amount: group.amount.toString(),
          })),
        },
        creditNotes: {
          create: { correctsDocumentId: invoice.id },
        },
      },
      select: { id: true, status: true },
    });

    await this.audit.record(
      this.prisma,
      {
        action: 'credit-note.drafted',
        entityType: CREDIT_NOTE,
        entityId: created.id,
        after: { status: created.status, correctsDocumentId: invoice.id },
      },
      { ...actor, ipAddress: ipAddress ?? null },
    );

    return { id: created.id, status: created.status };
  }

  /**
   * Edit a Draft Credit Note: which Invoice lines it reverses, and how much of each.
   *
   * The Invoice it corrects is not editable. Which Invoice a correction belongs to is
   * the document's identity, and re-pointing it would leave the stored figures
   * quoting one invoice while the row named another — so the patch schema has no
   * `invoiceId`, and a body carrying one is refused by name.
   *
   * Only a Draft, for the reason the invoice has: the database refuses to rewrite an
   * Issued document or its lines, and the correction for a wrong correction is
   * another Credit Note.
   */
  async update(
    id: string,
    payload: unknown,
    actor: AuditActor = {},
    ipAddress?: string | null,
  ): Promise<{ id: string; status: string }> {
    const input = creditNoteUpdateSchema.parse(payload);

    const note = await this.prisma.document.findFirst({
      where: { id, type: CREDIT_NOTE },
      include: { creditNotes: true },
    });
    if (!note) throw notFound('Credit Note', id);
    if (note.status !== 'DRAFT') {
      throw conflict(
        `Only a Draft Credit Note can be edited; ${id} is ${note.status}. An issued one is ` +
          'immutable, and the correction for a wrong correction is another Credit Note.',
        { id, status: note.status },
      );
    }

    const detail = note.creditNotes[0];
    invariant(detail, `Credit Note ${id} has no detail row.`);

    if (input.lines === undefined) {
      return { id, status: note.status };
    }

    // The reversal is re-derived from the *Invoice's* stored figures, never from the
    // Item's current price: a price that moved since the invoice was issued must not
    // change what a correction of it claims.
    const rows = await this.reversalRows(detail.correctsDocumentId, input.lines, id);

    const taxGroups = new Map<string, { base: Amount; amount: Amount }>();
    for (const row of rows) {
      const group = taxGroups.get(row.taxRate) ?? { base: Amount.zero(), amount: Amount.zero() };
      group.base = group.base.plus(Amount.parse(row.netAmount));
      group.amount = group.amount.plus(Amount.parse(row.taxAmount));
      taxGroups.set(row.taxRate, group);
    }

    const netAmount = sumOf(rows.map((row) => row.netAmount));
    const taxAmount = sumOf(rows.map((row) => row.taxAmount));
    const grossAmount = sumOf(rows.map((row) => row.grossAmount));

    await this.prisma.$transaction(async (tx) => {
      await tx.documentLine.deleteMany({ where: { documentId: id } });
      await tx.documentTaxGroup.deleteMany({ where: { documentId: id } });
      await tx.document.update({
        where: { id },
        data: { netAmount, taxAmount, grossAmount },
      });
      await tx.documentLine.createMany({
        data: rows.map((row, position) => ({
          documentId: id,
          position,
          itemId: row.itemId,
          unitOfMeasureId: row.unitOfMeasureId,
          description: row.description,
          quantity: row.quantity,
          unitPrice: row.unitPrice,
          taxRate: row.taxRate,
          netAmount: row.netAmount,
          fodecAmount: row.fodecAmount,
          taxAmount: row.taxAmount,
          grossAmount: row.grossAmount,
          correctsDocumentLineId: row.correctsDocumentLineId,
        })),
      });
      await tx.documentTaxGroup.createMany({
        data: [...taxGroups].map(([rateValue, group], position) => ({
          documentId: id,
          position,
          rate: rateValue,
          base: group.base.toString(),
          amount: group.amount.toString(),
        })),
      });
    });

    await this.audit.record(
      this.prisma,
      {
        action: 'credit-note.updated',
        entityType: CREDIT_NOTE,
        entityId: id,
        after: { status: note.status, grossAmount },
      },
      { ...actor, ipAddress: ipAddress ?? null },
    );

    return { id, status: note.status };
  }

  /**
   * Issue a Draft Credit Note: number it in its own series, archive the PDF,
   * make it immutable. No stock moves here — ever (ADR 0017).
   */
  async issue(
    creditNoteId: string,
    actor: AuditActor = {},
    ipAddress?: string | null,
  ): Promise<CreditNoteResponse> {
    const now = new Date();
    const year = now.getUTCFullYear();

    await this.prisma.$transaction(async (tx) => {
      const creditNote = await tx.document.findFirst({
        where: { id: creditNoteId, type: CREDIT_NOTE },
        include: {
          lines: { orderBy: { position: 'asc' } },
          creditNotes: true,
        },
      });

      if (!creditNote) throw notFound('Credit Note', creditNoteId);
      if (creditNote.status === 'ISSUED') {
        throw conflict(`Credit Note ${creditNoteId} is already issued as ${creditNote.number}.`, {
          id: creditNoteId,
          number: creditNote.number,
        });
      }
      if (creditNote.lines.length === 0) {
        throw validationFailed('A Draft with no lines cannot be issued.', { id: creditNoteId });
      }
      const correctsDocumentId = creditNote.creditNotes[0]?.correctsDocumentId;
      if (!correctsDocumentId) {
        throw validationFailed('A Credit Note must correct an Issued Invoice.', {
          id: creditNoteId,
        });
      }

      // Lock the Invoice so two simultaneous issues cannot both correct the
      // same remaining quantity.
      await tx.$executeRaw`SELECT id FROM document WHERE id = ${correctsDocumentId} FOR UPDATE`;
      await this.assertNoOverdraw(tx, correctsDocumentId);

      const sequence = await this.numbering.allocate(tx, CREDIT_NOTE, year);
      const allocated = await this.numbering.render(tx, CREDIT_NOTE, sequence, year);

      await tx.document.update({
        where: { id: creditNoteId },
        data: { status: 'ISSUED', number: allocated.number, issuedAt: now },
      });

      await this.audit.record(
        tx,
        {
          action: 'credit-note.issued',
          entityType: CREDIT_NOTE,
          entityId: creditNoteId,
          before: { status: 'DRAFT', number: null },
          after: { status: 'ISSUED', number: allocated.number },
        },
        { ...actor, ipAddress: ipAddress ?? null },
      );

      return { allocated, correctsDocumentId };
    });

    // Nothing is rendered here: the row committed above is the record, and the
    // paper is a view of it, produced when it is printed (ADR 0010).
    const found = await this.findById(creditNoteId);
    invariant(found, `Credit Note ${creditNoteId} vanished immediately after issuing.`);
    return found;
  }

  /**
   * The print copy: the credit note rendered from its stored row, which the
   * visitor's browser rasterises (ADR 0010).
   */
  readPrint(creditNoteId: string): Promise<string> {
    return printInvoiceCopy({
      prisma: this.prisma,
      labels: this.labels,
      code: CREDIT_NOTE,
      id: creditNoteId,
      entity: 'Credit Note',
    });
  }

  async findById(id: string): Promise<CreditNoteResponse | null> {
    const creditNote = await this.prisma.document.findFirst({
      where: { id, type: CREDIT_NOTE },
      include: {
        lines: { orderBy: { position: 'asc' } },
        taxes: { orderBy: { position: 'asc' } },
        party: true,
        creditNotes: true,
      },
    });
    if (!creditNote) return null;

    const correctedDocument = creditNote.creditNotes?.[0]?.correctsDocumentId
      ? await this.prisma.document.findFirst({
          where: { id: creditNote.creditNotes[0].correctsDocumentId },
        })
      : null;

    if (!correctedDocument?.number) {
      throw notFound('Corrected document', creditNote.creditNotes?.[0]?.correctsDocumentId ?? '');
    }

    return {
      id: creditNote.id,
      type: 'CREDIT_NOTE',
      status: documentStatusSchema.parse(creditNote.status),
      number: creditNote.number,
      partyId: creditNote.partyId,
      issuedAt: creditNote.issuedAt?.toISOString() ?? null,
      totals: {
        netAmount: money(creditNote.netAmount.toString()),
        fodecAmount: money(fodecTotal(creditNote.lines)),
        taxAmount: money(creditNote.taxAmount.toString()),
        grossAmount: money(creditNote.grossAmount.toString()),
        withholdingTaxAmount: money(creditNote.withholdingTaxAmount.toString()),
        stampDutyAmount: money(creditNote.stampDutyAmount.toString()),
      },
      businessId: creditNote.businessId,
      party: {
        id: creditNote.party.id,
        code: creditNote.party.code,
        name: creditNote.party.name,
        taxIdentifier: creditNote.party.taxIdentifier,
        address: creditNote.party.address,
        city: creditNote.party.city,
        countryCode: creditNote.party.countryCode,
      },
      locale: localeSchema.parse(creditNote.locale),
      vatRegime: vatRegimeSchema.parse(creditNote.vatRegime),
      currency: creditNote.currency,
      corrected: {
        documentId: correctedDocument.id,
        number: correctedDocument.number,
      },
      lines: creditNote.lines.map((line) => ({
        id: line.id,
        itemId: line.itemId,
        unitOfMeasureId: line.unitOfMeasureId,
        description: line.description,
        quantity: signedQuantitySchema.parse(line.quantity.toString()),
        unitPrice: money(line.unitPrice.toString()),
        taxRate: rate(line.taxRate.toString()),
        netAmount: money(line.netAmount.toString()),
        taxAmount: money(line.taxAmount.toString()),
        grossAmount: money(line.grossAmount.toString()),
        correctsDocumentLineId: line.correctsDocumentLineId ?? '',
      })),
      taxGroups: creditNote.taxes.map((group) => ({
        rate: rate(group.rate.toString()),
        base: money(group.base.toString()),
        amount: money(group.amount.toString()),
      })),
    };
  }

  /**
   * Resolve the requested corrections into stored reversal rows, refusing an
   * overdraw: what was already corrected plus what is asked now never exceeds
   * what the Invoice billed. Unknown Invoice lines are refused the same way —
   * a correction that names no billed line is a client bug.
   */
  private async reversalRows(
    invoiceId: string,
    requested: readonly { invoiceLineId: string; quantity: string }[],
    exceptDocumentId?: string,
  ): Promise<ReversalRow[]> {
    const invoice = await this.prisma.document.findFirst({
      where: { id: invoiceId, type: 'CUSTOMER_INVOICE' },
      include: { lines: true },
    });
    invariant(invoice, `Invoice ${invoiceId} vanished while drafting its correction.`);

    const credited = await creditedByLine(
      this.prisma,
      requested.map((line) => line.invoiceLineId),
      exceptDocumentId,
    );

    return requested.map((line) => {
      const billed = invoice.lines.find((candidate) => candidate.id === line.invoiceLineId);
      if (!billed) {
        throw validationFailed(`Invoice line ${line.invoiceLineId} is not on Invoice ${invoiceId}.`, {
          invoiceLineId: line.invoiceLineId,
        });
      }
      const wanted = Amount.parse(line.quantity);
      const already = credited.get(line.invoiceLineId) ?? Amount.zero();
      if (already.plus(wanted).isGreaterThan(Amount.parse(billed.quantity.toString()))) {
        throw validationFailed(
          `Correcting ${line.quantity} would overdraw Invoice line ${line.invoiceLineId}: ` +
            `billed ${billed.quantity}, already corrected ${already.toString()}.`,
          { invoiceLineId: line.invoiceLineId },
        );
      }
      const figures = reversalOf(
        {
          unitPrice: billed.unitPrice.toString(),
          taxRate: billed.taxRate.toString(),
          fodecAmount: billed.fodecAmount.toString(),
          quantity: billed.quantity.toString(),
        },
        line.quantity,
      );
      return {
        itemId: billed.itemId,
        unitOfMeasureId: billed.unitOfMeasureId,
        description: billed.description,
        ...figures,
        correctsDocumentLineId: billed.id,
      };
    });
  }

  /**
   * Re-check the overdraw guard at issue time, under the Invoice's row lock:
   * two drafts correcting the same remainder produce one Issued note and one
   * clear refusal, never a correction larger than the bill.
   */
  private async assertNoOverdraw(client: PrismaClient, invoiceId: string): Promise<void> {
    const invoice = await client.document.findFirst({
      where: { id: invoiceId, type: 'CUSTOMER_INVOICE' },
      include: { lines: true },
    });
    if (!invoice) throw notFound('Customer Invoice', invoiceId);

    const notes = await client.document.findMany({
      where: { type: CREDIT_NOTE, creditNotes: { some: { correctsDocumentId: invoiceId } } },
      include: { lines: true },
    });

    const corrected = new Map<string, Amount>();
    for (const note of notes) {
      for (const line of note.lines) {
        if (!line.correctsDocumentLineId) continue;
        const magnitude = Amount.parse(line.quantity.toString()).negated();
        const previous = corrected.get(line.correctsDocumentLineId) ?? Amount.zero();
        corrected.set(line.correctsDocumentLineId, previous.plus(magnitude));
      }
    }

    for (const billed of invoice.lines) {
      const total = corrected.get(billed.id) ?? Amount.zero();
      if (total.isGreaterThan(Amount.parse(billed.quantity.toString()))) {
        throw validationFailed(
          `Invoice line ${billed.id} is overdrawn: billed ${billed.quantity}, ` +
            `corrected ${total.toString()}.`,
          { invoiceLineId: billed.id },
        );
      }
    }
  }
}

function sumOf(values: readonly string[]): string {
  return values
    .reduce<Amount>((total, value) => total.plus(Amount.parse(value)), Amount.zero())
    .toString();
}

/**
 * The served FODEC total. There is no `Document.fodecAmount` column by design
 * (migration 20261013180000): the total is the sum of the stored line figures,
 * so the total and the lines cannot disagree.
 */
function fodecTotal(lines: readonly { fodecAmount: { toString(): string } }[]): string {
  return sumOf(lines.map((line) => line.fodecAmount.toString()));
}
