/**
 * The Customer Invoice flow (ADR 0005, ADR 0006, ADR 0010, ADR 0011, ADR 0014).
 *
 * ## The one rule everything else serves
 *
 * A request carries Items and quantities. It never carries a price, a tax rate or
 * an amount, and that is not this file's discipline to enforce: `orderLineInputSchema`
 * is a `strictObject`, so a request carrying `unitPrice` is rejected by the contract
 * with the field named. An earlier draft of this service hand-rolled that check and
 * was a worse version of something the contracts already had.
 *
 * ## The generic document table
 *
 * Since ADR 0014 every Document type lives in one `document` table, and a
 * Customer Invoice is a Document whose `type` is `CUSTOMER_INVOICE`. Every query
 * here therefore filters on that type, and the rows, lines and tax groups are
 * born in `price-document.ts` — the same pricing the Sales Order uses, so an
 * order and an invoice price a line identically.
 *
 * ## Drafts are priced, and issuing re-prices
 *
 * A Draft stores real figures, because a draft showing zero is not a draft anyone
 * can review. Issuing then re-reads every Item and prices it again, authoritatively.
 * A price changed between drafting and issuing is therefore reflected on the
 * document the client actually receives.
 *
 * ## Issuing is one transaction that ends at Issued
 *
 * After it commits there is no update path and no delete path in this service, and
 * three database triggers refuse both regardless — on the document *and* on its
 * lines and tax groups, because a parent guard alone would leave the figures editable.
 *
 * The paper is not rendered here at all: it is a view of the row, produced when
 * the document is printed (ADR 0010).
 */

import { Injectable } from '@nestjs/common';

import {
  documentStatusSchema,
  draftCustomerInvoiceSchema,
  localeSchema,
  money,
  quantity,
  rate,
  vatRegimeSchema,
  type CustomerInvoice as CustomerInvoiceResponse,
} from '@easyerp/contracts';

import { AuditService, type AuditActor } from '../audit/audit.service.js';
import {
  conflict,
  invariant,
  notFound,
  validationFailed,
} from '../common/errors.js';
import { Amount } from '../finance/amount.js';
import { buildCustomerInvoice } from '../finance/invoice-document.js';
import { terminologyFor } from '../finance/terminology.js';
import { printInvoiceCopy } from '../finance/print-copy.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LabelService } from '../settings/label.service.js';
import { DocumentNumberingService } from '../numbering/document-numbering.service.js';
import { priceItems, repriceTotals, type DocumentPricedLine } from './price-document.js';

export const CUSTOMER_INVOICE = 'CUSTOMER_INVOICE';

@Injectable()
export class CustomerInvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: DocumentNumberingService,
    private readonly labels: LabelService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Create a Draft. No number — a number exists only once the document is Issued
   * (ADR 0006) — but real prices, so it can be reviewed.
   *
   * The regime and currency are copied from the Business *now*, so a Settings change
   * during drafting cannot alter the document's legal treatment afterwards.
   */
  async createDraft(
    payload: unknown,
    actor: AuditActor = {},
    ipAddress?: string | null,
  ): Promise<{ id: string; status: string }> {
    // `.parse`, not `.safeParse`: `draftCustomerInvoiceSchema` is a strictObject, so a
    // body carrying `unitPrice` is rejected here with the field named. The global
    // DomainExceptionFilter already renders a ZodError as 422 with issue paths.
    const input = draftCustomerInvoiceSchema.parse(payload);

    const [business, party] = await Promise.all([
      this.prisma.business.findUnique({ where: { id: input.businessId } }),
      this.prisma.party.findFirst({
        where: { id: input.partyId, isActive: true, roles: { has: 'CUSTOMER' } },
      }),
    ]);

    if (!business) throw notFound('Business', input.businessId);
    if (!party) {
      throw validationFailed(
        `No active Party ${input.partyId} holding the CUSTOMER role. Parties are deactivated, ` +
          'never deleted, so a document that already quotes one keeps working.',
        { partyId: input.partyId },
      );
    }

    const priced = await priceItems(this.prisma, input.lines);
    const totals = documentTotals(priced);

    const created = await this.prisma.document.create({
      data: {
        type: CUSTOMER_INVOICE,
        status: 'DRAFT',
        businessId: business.id,
        partyId: party.id,
        locale: input.locale,
        vatRegime: business.vatRegime,
        currency: business.currency,
        netAmount: totals.netAmount,
        taxAmount: totals.taxAmount,
        grossAmount: totals.grossAmount,
        lines: {
          create: priced.map((line, position) => lineRow(line, position)),
        },
        taxes: {
          create: totals.taxGroups.map((group, position) => ({
            position,
            rate: group.rate,
            base: group.base,
            amount: group.amount,
          })),
        },
      },
      select: { id: true, status: true },
    });

    await this.audit.record(
      this.prisma,
      {
        action: 'customer-invoice.drafted',
        entityType: CUSTOMER_INVOICE,
        entityId: created.id,
        after: { status: created.status, grossAmount: totals.grossAmount },
      },
      { ...actor, ipAddress: ipAddress ?? null },
    );

    return { id: created.id, status: created.status };
  }

  /**
   * Issue a Draft: number it, re-price it, make it immutable.
   *
   * The render view is built *inside* the transaction from the same values that are
   * written, so the PDF and the stored rows cannot disagree and nothing is
   * reconstructed from a rendered number afterwards.
   */
  async issue(
    invoiceId: string,
    actor: AuditActor = {},
    ipAddress?: string | null,
  ): Promise<CustomerInvoiceResponse> {
    const issued = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.document.findFirst({
        where: { id: invoiceId, type: CUSTOMER_INVOICE },
        include: {
          lines: { orderBy: { position: 'asc' } },
          business: true,
          party: true,
        },
      });

      if (!invoice) throw notFound('Customer Invoice', invoiceId);

      if (invoice.status === 'ISSUED') {
        throw conflict(
          `Invoice ${invoiceId} is already issued as ${invoice.number}. Issued documents are ` +
            'immutable; correct it with a Credit Note.',
          { id: invoiceId, number: invoice.number },
        );
      }

      if (invoice.lines.length === 0) {
        throw validationFailed('A Draft with no lines cannot be issued.', { id: invoiceId });
      }

      const now = new Date();
      const year = now.getUTCFullYear();
      const sequence = await this.numbering.allocate(tx, CUSTOMER_INVOICE, year);
      const allocated = await this.numbering.render(tx, CUSTOMER_INVOICE, sequence, year);

      // Authoritative re-pricing: the Item rows are read again here, inside the same
      // transaction that writes the figures.
      const priced = await priceItems(
        tx,
        invoice.lines.map(({ itemId, quantity: q }) => ({
          itemId,
          quantity: quantity(q.toString()),
        })),
      );
      const totals = documentTotals(priced);

      for (const [position, line] of priced.entries()) {
        const stored = invoice.lines[position];
        invariant(stored, `Line ${position} vanished while issuing ${invoiceId}.`);

        await tx.documentLine.update({
          where: { id: stored.id },
          data: lineRow(line, position),
        });
      }

      await tx.documentTaxGroup.deleteMany({ where: { documentId: invoice.id } });
      for (const [position, group] of totals.taxGroups.entries()) {
        await tx.documentTaxGroup.create({
          data: {
            documentId: invoice.id,
            position,
            rate: group.rate,
            base: group.base,
            amount: group.amount,
          },
        });
      }

      await tx.document.update({
        where: { id: invoice.id },
        data: {
          status: 'ISSUED',
          number: allocated.number,
          issuedAt: now,
          netAmount: totals.netAmount,
          taxAmount: totals.taxAmount,
          grossAmount: totals.grossAmount,
        },
      });

      await this.audit.record(
        tx,
        {
          action: 'customer-invoice.issued',
          entityType: CUSTOMER_INVOICE,
          entityId: invoice.id,
          before: { status: 'DRAFT', number: null },
          after: { status: 'ISSUED', number: allocated.number },
        },
        { ...actor, ipAddress: ipAddress ?? null },
      );

      const locale = localeSchema.parse(invoice.locale);

      const view = buildCustomerInvoice({
        pattern: allocated.pattern,
        sequence: allocated.sequence,
        padding: allocated.padding,
        year,
        issuedAt: now.toISOString().slice(0, 10),
        locale,
        vatRegime: vatRegimeSchema.parse(invoice.vatRegime),
        currency: invoice.currency,
        labels: terminologyFor(locale, await this.labels.forDocument(locale)),
        issuer: {
          displayName: invoice.business.legalName,
          taxIdentifier: invoice.business.taxIdentifier,
          addressLines: [
            invoice.business.addressLine1,
            invoice.business.city,
            invoice.business.countryCode,
          ].filter((part): part is string => Boolean(part)),
        },
        party: {
          displayName: invoice.party.name,
          taxIdentifier: invoice.party.taxIdentifier ?? '',
          addressLines: [invoice.party.address, invoice.party.city].filter((part): part is string =>
            Boolean(part),
          ),
        },
        // Only Item-derived inputs are handed over. The builder re-derives the totals
        // from these same lines with the same `sumLines`, so what it prints and what
        // was stored cannot drift apart. `fodecSubject` travels with them: without
        // it the builder prices every line as non-subject while the stored figures
        // carry FODEC, and the re-render disagrees with the stored rows.
        lines: priced.map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          taxRate: line.taxRate,
          fodecSubject: line.fodecSubject,
        })),
        stampDuty: null,
        fodec: storedFodecTotal(priced),
      });

      return { view, year, invoiceId: invoice.id };
    });

    // Nothing is rendered here. The row committed above is the record — number,
    // figures and tax groups — and the paper is a view of it, produced when it is
    // printed. An issue therefore cannot fail for want of a renderer, and there is
    // no window in which a numbered document has no copy.
    const found = await this.findById(issued.invoiceId);
    invariant(found, `Invoice ${issued.invoiceId} vanished immediately after issuing.`);
    return found;
  }

  /**
   * The print copy: the paper rendered from the stored row, which the visitor's
   * browser rasterises (ADR 0010).
   */
  readPrint(invoiceId: string): Promise<string> {
    return printInvoiceCopy({
      prisma: this.prisma,
      labels: this.labels,
      code: CUSTOMER_INVOICE,
      id: invoiceId,
      entity: 'Customer Invoice',
    });
  }

  async findById(id: string): Promise<CustomerInvoiceResponse | null> {
    const invoice = await this.prisma.document.findFirst({
      where: { id, type: CUSTOMER_INVOICE },
      include: {
        lines: { orderBy: { position: 'asc' } },
        taxes: { orderBy: { position: 'asc' } },
        party: true,
      },
    });

    if (!invoice) return null;

    return {
      id: invoice.id,
      type: 'CUSTOMER_INVOICE',
      status: documentStatusSchema.parse(invoice.status),
      number: invoice.number,
      partyId: invoice.partyId,
      issuedAt: invoice.issuedAt?.toISOString() ?? null,
      totals: {
        netAmount: money(invoice.netAmount.toString()),
        fodecAmount: money(fodecTotal(invoice.lines)),
        taxAmount: money(invoice.taxAmount.toString()),
        grossAmount: money(invoice.grossAmount.toString()),
        withholdingTaxAmount: money(invoice.withholdingTaxAmount.toString()),
        stampDutyAmount: money(invoice.stampDutyAmount.toString()),
      },
      businessId: invoice.businessId,
      party: {
        id: invoice.party.id,
        code: invoice.party.code,
        name: invoice.party.name,
        taxIdentifier: invoice.party.taxIdentifier,
        address: invoice.party.address,
        city: invoice.party.city,
        countryCode: invoice.party.countryCode,
      },
      locale: localeSchema.parse(invoice.locale),
      vatRegime: vatRegimeSchema.parse(invoice.vatRegime),
      currency: invoice.currency,
      lines: invoice.lines.map((line) => ({
        id: line.id,
        itemId: line.itemId,
        unitOfMeasureId: line.unitOfMeasureId,
        description: line.description,
        quantity: quantity(line.quantity.toString()),
        unitPrice: money(line.unitPrice.toString()),
        taxRate: rate(line.taxRate.toString()),
        netAmount: money(line.netAmount.toString()),
        fodecAmount: money(line.fodecAmount.toString()),
        taxAmount: money(line.taxAmount.toString()),
        grossAmount: money(line.grossAmount.toString()),
      })),
      taxGroups: invoice.taxes.map((group) => ({
        rate: rate(group.rate.toString()),
        base: money(group.base.toString()),
        amount: money(group.amount.toString()),
      })),
    };
  }
}

/** The totals of a set of priced lines, as the storage row wants them. */
function documentTotals(priced: readonly DocumentPricedLine[]): {
  netAmount: string;
  taxAmount: string;
  grossAmount: string;
  taxGroups: { rate: string; base: string; amount: string }[];
} {
  const groups = repriceTotals(priced);
  return {
    netAmount: groups.net.toString(),
    taxAmount: groups.tax.toString(),
    grossAmount: groups.gross.toString(),
    taxGroups: groups.taxByRate.map((group) => ({
      rate: group.rate,
      base: group.base.toString(),
      amount: group.amount.toString(),
    })),
  };
}

/** The priced figure columns of a line, for the storage row. */
interface LineRow {
  readonly position: number;
  readonly itemId: string;
  readonly unitOfMeasureId: string;
  readonly description: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly taxRate: string;
  readonly netAmount: string;
  readonly fodecAmount: string;
  readonly taxAmount: string;
  readonly grossAmount: string;
}

function lineRow(line: DocumentPricedLine, position: number): LineRow {
  return {
    position,
    itemId: line.itemId,
    unitOfMeasureId: line.unitOfMeasureId,
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    taxRate: line.taxRate,
    netAmount: line.netAmount,
    fodecAmount: line.fodecAmount,
    taxAmount: line.taxAmount,
    grossAmount: line.grossAmount,
  };
}

/**
 * The stored FODEC total, as the column would carry it: the sum of the stored line
 * figures, never recomputed. `null` when zero, so documents without FODEC
 * render exactly as before (the template prints no FODEC row for `null`).
 */
function storedFodecTotal(lines: readonly { fodecAmount: { toString(): string } }[]): string | null {
  const total = fodecTotal(lines);
  return Amount.parse(total).isZero() ? null : total;
}

/**
 * The served FODEC total. There is no `Document.fodecAmount` column by design
 * (migration 20261013180000): the total is the sum of the stored line figures,
 * so the total and the lines cannot disagree.
 */
function fodecTotal(lines: readonly { fodecAmount: { toString(): string } }[]): string {
  return lines
    .reduce(
      (total, line) => total.plus(Amount.parse(line.fodecAmount.toString())),
      Amount.zero(),
    )
    .toString();
}
