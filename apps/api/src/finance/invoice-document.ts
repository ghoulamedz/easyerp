/**
 * The Customer Invoice render model (ADR 0010, ADR 0011).
 *
 * This module turns priced lines into exactly what a document prints, and it is
 * the first production caller of `renderDocumentNumber` — which is what makes the
 * stored Number Pattern's padding take effect rather than sitting unused.
 *
 * Two properties are deliberate:
 *
 * 1. Money enters as `Amount` and leaves as `Amount.toString()`. Nothing here
 *    re-rounds. The totals the API returned to the user are the totals the
 *    document prints; a template that recomputes them is a template that can
 *    disagree with the screen.
 * 2. The VAT regime is carried through as data, not applied here. Whether an
 *    exemption may attach to an activity rather than to the whole Business is a
 *    tax question this module must not answer — CONTEXT.md defines the regime as
 *    a Business fact, and ADR 0009 keeps unreviewed tax reasoning out of the
 *    code. The template decides what to show; this module records what it is.
 */

import { renderDocumentNumber, type NumberPattern, type VatRegime } from '@easyerp/contracts';

import { Amount } from './amount.js';
import { priceLine, sumLines, type PricedLineInput } from './pricing.js';
import { directionOf, type LabelResolver, type Locale } from './terminology.js';

export interface DocumentParty {
  readonly displayName: string;
  readonly taxIdentifier: string;
  readonly addressLines: readonly string[];
}

export interface InvoiceLineView {
  readonly description: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly net: string;
  readonly taxRate: string;
  readonly taxAmount: string;
  readonly gross: string;
}

export interface TaxGroupView {
  readonly rate: string;
  readonly base: string;
  readonly amount: string;
}

export interface CustomerInvoiceView {
  /**
   * Which fiscal Document this prints: a Customer Invoice or the Credit Note that
   * reverses it. The kind chooses the title label; both kinds share every other
   * row, so one template cannot drift into two documents.
   */
  readonly kind: 'CUSTOMER_INVOICE' | 'CREDIT_NOTE';
  readonly locale: Locale;
  readonly direction: 'ltr' | 'rtl';
  readonly number: string;
  readonly issuedAt: string;
  readonly vatRegime: VatRegime;
  readonly currency: string;
  readonly issuer: DocumentParty;
  readonly party: DocumentParty;
  readonly labels: LabelResolver;
  readonly lines: readonly InvoiceLineView[];
  readonly taxGroups: readonly TaxGroupView[];
  readonly net: string;
  readonly tax: string;
  readonly gross: string;
  /** Printed as its own line, never folded into the gross total (ADR 0011). */
  readonly stampDuty: string | null;
  readonly withholdingTax: string | null;
  /**
   * The number of the corrected Invoice. Present only on a Credit Note; an
   * avoir without its source would be unanswerable in the file, so the field is
   * part of the Credit Note's printed field set.
   */
  readonly correctedNumber: string | null;
}

export interface CustomerInvoiceInput {
  readonly pattern: NumberPattern;
  readonly sequence: number;
  /** From the stored Number Pattern, so the padding is honoured end to end. */
  readonly padding: number;
  readonly year: number;
  readonly issuedAt: string;
  readonly locale: Locale;
  readonly vatRegime: VatRegime;
  readonly currency: string;
  readonly labels: LabelResolver;
  readonly issuer: DocumentParty;
  readonly party: DocumentParty;
  readonly lines: readonly (PricedLineInput & { readonly description: string })[];
  readonly kind?: 'CUSTOMER_INVOICE' | 'CREDIT_NOTE';
  readonly correctedNumber?: string | null;
  readonly stampDuty?: string | null;
  readonly withholdingTax?: string | null;
}

export function buildCustomerInvoice(input: CustomerInvoiceInput): CustomerInvoiceView {
  const priced = input.lines.map((line) => ({
    ...priceLine(line),
    taxRate: line.taxRate,
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
  }));

  const totals = sumLines(priced);

  return {
    kind: input.kind ?? 'CUSTOMER_INVOICE',
    locale: input.locale,
    direction: directionOf(input.locale),
    number: renderDocumentNumber(input.pattern, {
      sequence: input.sequence,
      year: input.year,
      padding: input.padding,
    }),
    issuedAt: input.issuedAt,
    vatRegime: input.vatRegime,
    currency: input.currency,
    issuer: input.issuer,
    party: input.party,
    labels: input.labels,
    correctedNumber: input.correctedNumber ?? null,
    lines: priced.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      net: line.net.toString(),
      taxRate: line.taxRate,
      taxAmount: line.tax.toString(),
      gross: line.gross.toString(),
    })),
    taxGroups: totals.taxByRate.map((group) => ({
      rate: group.rate,
      base: group.base.toString(),
      amount: group.amount.toString(),
    })),
    net: totals.net.toString(),
    tax: totals.tax.toString(),
    gross: totals.gross.toString(),
    stampDuty: optionalMoney(input.stampDuty),
    withholdingTax: optionalMoney(input.withholdingTax),
  };
}

/** An absent optional figure is absent, not zero: `null` means "does not print". */
function optionalMoney(value: string | null | undefined): string | null {
  return value === undefined || value === null ? null : Amount.parse(value).toString();
}
