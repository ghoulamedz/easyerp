/**
 * Consistency of the five operational papers: what is on them is what the row holds.
 *
 * The priced papers must print their figures; the quantity papers must print
 * quantities and **no money at all** — an operational note that shows a price it
 * never charged is a wrong paper, and that is a rule no byte-for-byte golden could
 * state, because it would have blessed whichever behaviour was there first.
 *
 * As with the invoice, the assertions read the *view* — the data the server has —
 * and then require it on the page. Restyle the table, reorder the header, change
 * the wording: nothing here objects. Print another party, lose an amount, round a
 * total, and it fails.
 */

import { describe, expect, it } from 'vitest';

import { formatMoney } from '../../finance/invoice-template.js';
import type { PaperView } from '../paper-document.js';
import type { Locale } from '../../finance/terminology.js';
import { renderPaperHtml } from '../paper-template.js';

/**
 * A paper's lines, whichever shape it carries.
 *
 * `PaperView` holds them in two arrays — a priced paper's lines carry money, a
 * quantities paper's carry a unit — and both end up in the same table, so the
 * assertions read the union rather than caring which kind the paper is.
 */
function linesOf(view: PaperView): readonly PaperLine[] {
  return view.priced
    ? view.pricedLines.map((line) => ({ ...line, unitCode: null }))
    : view.quantityLines;
}

interface PaperLine {
  readonly description: string;
  readonly quantity: string;
  readonly unitPrice?: string;
  readonly netAmount?: string;
  readonly grossAmount?: string;
}

/** Quantities print without trailing zeros (`2.000` is printed as `2`). */
const printedQuantity = (quantity: string): string =>
  quantity.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
import { PAPERS, salesOrder } from './paper-fixtures.js';

const LOCALES: readonly Locale[] = ['fr', 'en', 'ar'];

/** The visible text of a paper, with tags and the stylesheet removed. */
function textOf(html: string): string {
  return html
    .replace(/<style>[\s\S]*?<\/style>/, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}

describe.each(Object.entries(PAPERS))('%s paper', (name, build) => {
  it.each(LOCALES)('prints the number, the date and the issuer in %s', (locale) => {
    const view = build(locale);
    const text = textOf(renderPaperHtml(view));

    expect(text).toContain(view.number);
    expect(text).toContain(view.issuedAt);
    expect(text).toContain(view.issuer.displayName);
    // The issuer's tax identifier is part of the identity the paper carries.
    expect(text).toContain(view.issuer.taxIdentifier);
  });

  it.each(LOCALES)('prints every line with its quantity in %s', (locale) => {
    const view = build(locale);
    const text = textOf(renderPaperHtml(view));

    for (const line of linesOf(view)) {
      expect(text, `${name}: line "${line.description}" is missing`).toContain(line.description);
      // A quantity keeps its own scale on the page: `1`, `2.5` and `10`, never
      // `1.000` — three decimals are the money scale, not the count.
      expect(text).toContain(printedQuantity(line.quantity));
    }
  });

  it('never prints a placeholder', () => {
    for (const locale of LOCALES) {
      const html = renderPaperHtml(build(locale));

      for (const marker of ['undefined', 'NaN', 'null', '[object Object]', '#{', '{{']) {
        expect(html, `${name} (${locale}) printed "${marker}"`).not.toContain(marker);
      }
    }
  });
});

describe('a priced paper prints its money, and a quantity paper does not', () => {
  it('prints the stored subtotal and grand total on the Sales Order', () => {
    const view = salesOrder('fr');
    const html = renderPaperHtml(view);

    expect(view.totals).not.toBeNull();
    expect(html).toContain(formatMoney(view.totals!.netAmount));
    expect(html).toContain(formatMoney(view.totals!.grossAmount));
  });

  /**
   * A priced paper whose grand total differs from its subtotal must say why.
   *
   * `renderTotals` prints the VAT row only when the paper carries per-rate tax
   * groups, and `salesOrderPaperView` passes none (`taxGroups: []`) — so a Sales
   * Order shows HT and TTC with the difference unexplained. A Purchase Order,
   * which does pass groups, prints the row. Whether a Sales Order should is a
   * wording decision for a human (ADR 0009), so this records the behaviour instead
   * of changing it, and turns red when it is fixed.
   */
  it.fails('prints the VAT total on a Sales Order whose gross differs from its net', () => {
    const view = salesOrder('fr');

    expect(Number(view.totals!.grossAmount)).not.toBe(Number(view.totals!.netAmount));
    expect(renderPaperHtml(view)).toContain(formatMoney(view.totals!.taxAmount));
  });

  it('prints the VAT row on a paper that carries per-rate groups', () => {
    const view = PAPERS['purchase-order']('fr');

    expect(view.taxGroups.length).toBeGreaterThan(0);
    expect(renderPaperHtml(view)).toContain(formatMoney(view.totals!.taxAmount));
  });

  it.each(Object.entries(PAPERS))('%s prints the figures its line view carries', (_name, build) => {
    const view = build('fr');

    const html = renderPaperHtml(view);

    for (const line of linesOf(view)) {
      for (const figure of [line.unitPrice, line.netAmount, line.grossAmount]) {
        if (figure === undefined) continue;
        expect(html, `a priced line printed without its ${formatMoney(figure)}`).toContain(
          formatMoney(figure),
        );
      }
    }
  });

  it.each([
    ['delivery-note', PAPERS['delivery-note']],
    ['goods-receipt', PAPERS['goods-receipt']],
    ['production-order', PAPERS['production-order']],
  ] as const)('%s carries no money column at all', (_name, build) => {
    const view = build('fr');
    // The body only: the stylesheet defines `.totals` for the priced papers and
    // would match the string no matter which paper is being printed.
    const body = renderPaperHtml(view).replace(/<style>[\s\S]*?<\/style>/, '');

    // The structural claim: the priced table and the totals block are absent.
    expect(body).not.toContain('class="totals"');
    expect(body).not.toContain('field.unitPrice');
    // And no viewed line carries a figure that could have been printed.
    for (const line of linesOf(view)) {
      expect(line.unitPrice).toBeUndefined();
      expect(line.netAmount).toBeUndefined();
    }
  });
});

describe('a paper names the document it relates to', () => {
  it.each([
    ['delivery-note', PAPERS['delivery-note'], 'BC-2026-0042'],
    ['goods-receipt', PAPERS['goods-receipt'], 'CF-2026-0042'],
    ['production-order', PAPERS['production-order'], 'Étagère murale 120cm'],
  ] as const)('%s references %s', (_name, build, reference) => {
    // A Delivery Note without the order it fulfils, or a Goods Receipt without the
    // purchase it fulfils, cannot be reconciled by the person holding it.
    expect(renderPaperHtml(build('fr'))).toContain(reference);
  });
});

describe('direction follows the locale', () => {
  it.each(Object.entries(PAPERS))('%s is RTL in Arabic and LTR in French', (_name, build) => {
    expect(renderPaperHtml(build('ar'))).toContain('dir="rtl"');
    expect(renderPaperHtml(build('fr'))).toContain('dir="ltr"');
  });
});
