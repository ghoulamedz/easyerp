/**
 * Printing a fiscal Document: the Customer Invoice and the Credit Note.
 *
 * They share this code because they are one paper with two signs — the same
 * template, the same tax breakdown, the same figures — and the failure that
 * matters (a reprint whose numbers differ from the row) is exactly what
 * duplication invites.
 *
 * ## Rendered on demand, from the row
 *
 * Nothing is stored. The document row is the record: number, dates, party, lines,
 * tax groups and totals are all in the database, written once at issue and
 * immutable since, and the paper is a view of them. Rendering therefore cannot
 * disagree with the record — there is no file that could — and there is no
 * "issued but not yet archived" state to represent.
 *
 * The view is built from **stored rows, never from Items**: a tax rate or a FODEC
 * flag edited since issuing must not alter how an old invoice prints. Subject-ness
 * is read back from the stored figure (a line that carries FODEC was subject), so
 * the builder re-derives exactly the tax and gross the row already holds.
 *
 * What a reprint *does* follow is today's template and label table. That is the
 * accepted price of storing no copy: figures never move, wording may.
 */

import { Amount } from './amount.js';
import { buildCustomerInvoice } from './invoice-document.js';
import { renderInvoiceHtml } from './invoice-template.js';
import { terminologyFor } from './terminology.js';
import type { LabelService } from '../settings/label.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { notFound } from '../common/errors.js';
import { localeSchema, vatRegimeSchema } from '@easyerp/contracts';

export interface PrintCopyInput {
  readonly prisma: PrismaService;
  readonly labels: LabelService;
  readonly code: 'CUSTOMER_INVOICE' | 'CREDIT_NOTE';
  readonly id: string;
  /** The name the API answers with when the document does not exist. */
  readonly entity: string;
}

/**
 * The paper of an issued Invoice or Credit Note, as self-contained HTML.
 *
 * A Draft has no number to print and answers `NOT_FOUND`, the same answer the
 * document endpoint gives. Both types are ISSUED-only for printing, because a
 * document without a number has nothing on its paper that identifies it.
 */
export async function printInvoiceCopy(input: PrintCopyInput): Promise<string> {
  const { prisma, labels, code, id, entity } = input;

  const document = await prisma.document.findFirst({
    where: { id, type: code },
    include: {
      lines: { orderBy: { position: 'asc' } },
      taxes: { orderBy: { position: 'asc' } },
      business: true,
      party: true,
      creditNotes: true,
    },
  });

  if (!document) throw notFound(entity, id);
  if (document.status !== 'ISSUED' || document.number === null) {
    throw notFound('Printable document', id);
  }

  const locale = localeSchema.parse(document.locale);
  const year = document.issuedAt?.getUTCFullYear() ?? new Date().getUTCFullYear();
  const correctedNumber =
    code === 'CREDIT_NOTE' ? await correctedNumberOf(prisma, document.id) : null;

  const view = buildCustomerInvoice({
    // The document already carries its formatted number: the pattern is only used
    // when a document is being numbered, which happened at issue. Passing a
    // pass-through pattern keeps the builder's number logic in one place.
    pattern: '{seq}',
    sequence: 0,
    padding: 0,
    year,
    issuedAt: document.issuedAt?.toISOString().slice(0, 10) ?? '',
    locale,
    vatRegime: vatRegimeSchema.parse(document.vatRegime),
    currency: document.currency,
    labels: terminologyFor(locale, await labels.forDocument(locale)),
    issuer: {
      displayName: document.business.legalName,
      taxIdentifier: document.business.taxIdentifier,
      addressLines: [
        document.business.addressLine1,
        document.business.city,
        document.business.countryCode,
      ].filter((part): part is string => Boolean(part)),
    },
    party: {
      displayName: document.party.name,
      taxIdentifier: document.party.taxIdentifier ?? '',
      addressLines: [document.party.address, document.party.city].filter((part): part is string =>
        Boolean(part),
      ),
    },
    // The stored rows are the authority, not the Items.
    lines: document.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity.toString(),
      unitPrice: line.unitPrice.toString(),
      taxRate: line.taxRate.toString(),
      fodecSubject: !Amount.parse(line.fodecAmount.toString()).isZero(),
    })),
    stampDuty:
      document.stampDutyAmount.toString() === '0' ? null : document.stampDutyAmount.toString(),
    withholdingTax:
      document.withholdingTaxAmount.toString() === '0'
        ? null
        : document.withholdingTaxAmount.toString(),
    fodec: storedFodecTotal(document.lines),
    formattedNumber: document.number,
    ...(code === 'CREDIT_NOTE'
      ? { kind: 'CREDIT_NOTE' as const, correctedNumber }
      : {}),
  });

  return renderInvoiceHtml(view);
}

/** The Invoice a Credit Note corrects, for the "corrige la facture" reference. */
async function correctedNumberOf(prisma: PrismaService, documentId: string): Promise<string | null> {
  const correction = await prisma.creditNote.findUnique({
    where: { documentId },
    select: { correctsDocument: { select: { number: true } } },
  });

  return correction?.correctsDocument.number ?? null;
}

/**
 * The stored FODEC total for a print copy: the sum of the stored line figures,
 * never recomputed. `null` when zero, so a document without FODEC prints no FODEC
 * row at all.
 */
function storedFodecTotal(
  lines: readonly { fodecAmount: { toString(): string } }[],
): string | null {
  const total = lines
    .reduce<Amount>((sum, line) => sum.plus(Amount.parse(line.fodecAmount.toString())), Amount.zero())
    .toString();

  return Amount.parse(total).isZero() ? null : total;
}
