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
}

export interface LineAmounts {
  readonly net: Amount;
  readonly tax: Amount;
  readonly gross: Amount;
}

export interface DocumentAmounts extends LineAmounts {
  /** Per tax rate, in the order the rates were encountered. */
  readonly taxByRate: readonly { readonly rate: string; readonly amount: Amount }[];
}

export function priceLine(input: PricedLineInput): LineAmounts {
  const net = Amount.parse(input.unitPrice).timesQuantity(input.quantity);
  const tax = net.timesRate(input.taxRate);
  return { net, tax, gross: net.plus(tax) };
}

/**
 * Aggregate priced lines into document totals. Each line's tax is attributed to
 * the rate it was priced at, so an invoice prints one line per rate rather than
 * a single blended figure — the breakdown a tax authority expects.
 */
export function sumLines(
  lines: readonly (LineAmounts & { readonly taxRate: string })[],
): DocumentAmounts {
  const taxByRate = new Map<string, Amount>();

  const net = lines.reduce<Amount>((total, line) => total.plus(line.net), Amount.zero());
  const tax = lines.reduce<Amount>((total, line) => total.plus(line.tax), Amount.zero());
  const gross = lines.reduce<Amount>((total, line) => total.plus(line.gross), Amount.zero());

  for (const line of lines) {
    const current = taxByRate.get(line.taxRate) ?? Amount.zero();
    taxByRate.set(line.taxRate, current.plus(line.tax));
  }

  return {
    net,
    tax,
    gross,
    taxByRate: [...taxByRate.entries()].map(([rate, value]) => ({ rate, amount: value })),
  };
}
