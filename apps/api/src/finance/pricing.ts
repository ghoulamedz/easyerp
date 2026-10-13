/**
 * Server-side pricing (ADR 0005).
 *
 * A client sends an Item and a quantity. The unit price and the tax rate come
 * from the Item, and every amount is derived here. Nothing in this module reads
 * a price from a request, because a client that can send a price can forge an
 * invoice.
 *
 * Rounding happens once per line, and the document total is the sum of the
 * rounded lines. Summing first and rounding at the end would make a document's
 * tax total differ from the sum of the tax the user can see on its lines.
 */

import { Amount } from './amount.js';

export interface PricedLineInput {
  readonly quantity: string;
  /** Resolved from the Item, never from the request. */
  readonly unitPrice: string;
  /** Resolved from the Item's tax assignment, never from the request. */
  readonly taxRate: string;
  /**
   * Whether the Item is FODEC-subject. Optional so callers pricing rows that
   * predate the flag keep compiling; absent means not subject.
   */
  readonly fodecSubject?: boolean;
}

/** FODEC rate in percent, applied to the HT net of a subject line (research §2). */
export const FODEC_RATE = '1';

export interface LineAmounts {
  readonly net: Amount;
  /** FODEC 1% of the net when the line is subject, zero otherwise. */
  readonly fodec: Amount;
  readonly tax: Amount;
  readonly gross: Amount;
}

/**
 * One group of the tax breakdown: the rate, the net it was applied to, and the
 * tax it produced. The base is carried alongside the amount because a breakdown
 * without a base is not a breakdown — `19% of what` is not answerable from the
 * tax figure alone.
 */
export interface TaxRateGroup {
  readonly rate: string;
  readonly base: Amount;
  readonly amount: Amount;
}

export interface DocumentAmounts extends LineAmounts {
  /** Per tax rate, in the order the rates were encountered. */
  readonly taxByRate: readonly TaxRateGroup[];
}

export function priceLine(input: PricedLineInput): LineAmounts {
  // Canonical order, frozen per docs/tunisia-fiscal-research.md §2: net is
  // qty × unitPrice (rounded once) → fodec is 1% of the net for a subject line
  // (rounded once) → the VAT base is net + fodec → tax is base × rate (rounded
  // once) → gross is base + tax. A non-subject line prices exactly as before.
  const net = Amount.parse(input.unitPrice).timesQuantity(input.quantity);
  const fodec = input.fodecSubject === true ? net.timesRate(FODEC_RATE) : Amount.zero();
  const base = net.plus(fodec);
  const tax = base.timesRate(input.taxRate);
  return { net, fodec, tax, gross: base.plus(tax) };
}

/**
 * Aggregate priced lines into document totals. Each line's tax is attributed to
 * the rate it was priced at, so an invoice prints one line per rate rather than
 * a single blended figure — the breakdown a tax authority expects.
 */
export function sumLines(
  lines: readonly (LineAmounts & { readonly taxRate: string })[],
): DocumentAmounts {
  const taxByRate = new Map<string, { base: Amount; amount: Amount }>();

  const net = lines.reduce<Amount>((total, line) => total.plus(line.net), Amount.zero());
  // The FODEC total is the sum of the rounded line figures, never recomputed
  // from the summed net: rounding each line first can differ from rounding once.
  const fodec = lines.reduce<Amount>((total, line) => total.plus(line.fodec), Amount.zero());
  const tax = lines.reduce<Amount>((total, line) => total.plus(line.tax), Amount.zero());
  const gross = lines.reduce<Amount>((total, line) => total.plus(line.gross), Amount.zero());

  for (const line of lines) {
    const current = taxByRate.get(line.taxRate) ?? {
      base: Amount.zero(),
      amount: Amount.zero(),
    };
    taxByRate.set(line.taxRate, {
      base: current.base.plus(line.net),
      amount: current.amount.plus(line.tax),
    });
  }

  return {
    net,
    fodec,
    tax,
    gross,
    taxByRate: [...taxByRate.entries()].map(([rate, group]) => ({ rate, ...group })),
  };
}
