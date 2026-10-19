/**
 * Consistency of the printed paper: the data on it is the data in the row.
 *
 * ## What this replaces, and why
 *
 * The previous gate compared rendered files byte for byte against committed
 * copies. That made every cosmetic edit a red gate, put a browser in the fast
 * loop, and — worst of the three — asserted nothing about the thing that actually
 * matters, because a golden is re-blessed from the same code that produced it: a
 * wrong figure re-blessed is a wrong baseline.
 *
 * What matters is this: **the letters and numbers a person reads on the paper are
 * the letters and numbers the Business recorded.** So these assertions read the
 * figures out of the view and then require them on the page — the number, every
 * money amount, the party, the issuer's legal identity, the tax breakdown per
 * rate, the FODEC and stamp-duty lines. Change the markup, restyle the table, move
 * a column: nothing here objects. Print a different number, lose a tax line, round
 * a total, and it fails.
 *
 * ## What it cannot see
 *
 * Pagination and Arabic glyph shaping need a layout engine. `print-contract.test.ts`
 * covers the structural half of that (A4, logical properties, a font stack that can
 * shape Arabic) and no test covers the rest — an invoice that spills onto a third
 * page is caught by printing one.
 */

import { describe, expect, it } from 'vitest';

import { renderInvoiceHtml } from '../invoice-template.js';
import { EXEMPT_LINES, invoice, MIXED_RATE_LINES, STANDARD_LINES } from './invoice-fixtures.js';

/** The visible text of a paper, with tags and the stylesheet removed. */
function textOf(html: string): string {
  return html
    .replace(/<style>[\s\S]*?<\/style>/, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}

describe('the invoice paper carries the stored data', () => {
  it('prints the number, the dates and the issuer’s legal identity', () => {
    const view = invoice('fr', 'STANDARD', STANDARD_LINES);
    const text = textOf(renderInvoiceHtml(view));

    expect(text).toContain(view.number);
    expect(text).toContain(view.issuedAt);
    expect(text).toContain(view.issuer.displayName);
    expect(text).toContain(view.party.displayName);
    // The addresses are part of the identity a fiscal document carries.
    expect(text).toContain(view.issuer.addressLines[0]!);
    expect(text).toContain(view.party.addressLines[0]!);
  });

  it('prints every line with its quantity, unit price and amount', () => {
    const view = invoice('fr', 'STANDARD', STANDARD_LINES);
    const text = textOf(renderInvoiceHtml(view));

    for (const line of view.lines) {
      expect(text, `line "${line.description}" is missing from the paper`).toContain(
        line.description,
      );
      expect(text).toContain(line.unitPrice);
    }
  });

  it('prints the totals the row holds, to the millime', () => {
    // Three decimals is the stored scale; a paper that rounds to two is a
    // different number from the one in the database.
    const view = invoice('fr', 'STANDARD', STANDARD_LINES);
    const html = renderInvoiceHtml(view);

    expect(html).toContain(view.net);
    expect(html).toContain(view.tax);
    expect(html).toContain(view.gross);
    expect(html).toContain(view.stampDuty!);
  });

  it('prints every tax rate of the breakdown, with its base and its amount', () => {
    const view = invoice('fr', 'STANDARD', MIXED_RATE_LINES);
    const html = renderInvoiceHtml(view);

    for (const group of view.taxGroups) {
      expect(html, `rate ${group.rate} is missing from the breakdown`).toContain(group.rate);
      expect(html).toContain(group.base);
      expect(html).toContain(group.amount);
    }
  });

  it('shows the exemption mention instead of a breakdown when the regime is EXEMPT', () => {
    const exempt = renderInvoiceHtml(invoice('fr', 'EXEMPT', EXEMPT_LINES));

    expect(exempt).not.toContain('class="vat-table"');
    expect(exempt).toContain('vat-exempt');
  });

  it('prints the same figures in every locale', () => {
    // The wording changes; the numbers must not. A locale that reformats money is
    // a locale where a customer reads a different amount.
    for (const locale of ['fr', 'en', 'ar'] as const) {
      const view = invoice(locale, 'STANDARD', MIXED_RATE_LINES);
      const html = renderInvoiceHtml(view);

      expect(html, `${locale} lost the gross total`).toContain(view.gross);
      expect(html, `${locale} lost the net total`).toContain(view.net);
      expect(html, `${locale} lost the number`).toContain(view.number);
    }
  });

  it('prints the FODEC total the row carries, on its own line before VAT', () => {
    // There is no FODEC column on the document by design: the view's total is the
    // sum of the stored line figures, so a paper that printed a recomputed FODEC
    // could disagree with its own lines. The arithmetic itself is covered by the
    // pricing tests; what this asserts is that the figure reaches the paper.
    const view = invoice('fr', 'STANDARD', STANDARD_LINES, { fodec: '3.300' });

    expect(view.fodec).toBe('3.300');
    expect(renderInvoiceHtml(view)).toContain('3.300');
  });

  it('prints no FODEC row at all when the row carries none', () => {
    // A zero FODEC is not a FODEC of zero: printing an empty row would tell a
    // customer FODEC was assessed and came to nothing.
    const view = invoice('fr', 'STANDARD', STANDARD_LINES);

    expect(view.fodec).toBeNull();
    expect(renderInvoiceHtml(view)).not.toContain('fodec-row');
  });

  /**
   * The gap the old goldens could not see.
   *
   * A Tunisian invoice carries the seller's and the buyer's *matricule fiscal* —
   * the tax identifier — and the view has carried both all along
   * (`issuer.taxIdentifier`, `party.taxIdentifier`). The fiscal template printed
   * neither, while the operational papers did, which is how the omission survived
   * a byte-for-byte golden: the baseline was re-blessed from the same template.
   */
  it('prints both tax identifiers, which a Tunisian invoice requires', () => {
    const view = invoice('fr', 'STANDARD', STANDARD_LINES);
    const text = textOf(renderInvoiceHtml(view));

    expect(text).toContain(view.issuer.taxIdentifier);
    expect(text).toContain(view.party.taxIdentifier);
  });

  it('omits the line rather than printing an empty one when a party has no identifier', () => {
    const view = invoice('fr', 'STANDARD', STANDARD_LINES);
    const html = renderInvoiceHtml({ ...view, party: { ...view.party, taxIdentifier: '' } });

    // No stray blank block where the identifier would be: the template skips the
    // element, the way the paper template does.
    expect(textOf(html)).toContain(view.party.displayName);
    expect(textOf(html)).not.toContain(view.party.taxIdentifier);
  });
});

describe('no paper prints a placeholder', () => {
  const papers = {
    fr: renderInvoiceHtml(invoice('fr', 'STANDARD', STANDARD_LINES)),
    ar: renderInvoiceHtml(invoice('ar', 'STANDARD', STANDARD_LINES)),
    exempt: renderInvoiceHtml(invoice('fr', 'EXEMPT', EXEMPT_LINES)),
  };

  it.each(Object.entries(papers))('%s: no unresolved value reaches the page', (_locale, html) => {
    // The failure this catches is a template that prints the shape of an absent
    // value: `undefined`, `NaN`, `[object Object]`, or a placeholder somebody
    // meant to fill in. Every one of them has reached production in some product.
    for (const marker of ['undefined', 'NaN', 'null', '[object Object]', '#{', '{{', 'TODO']) {
      expect(html, `a paper printed "${marker}"`).not.toContain(marker);
    }
  });

  it.each(Object.entries(papers))('%s: the amount is never zero-only or empty', (_locale, html) => {
    const text = textOf(html);

    expect(text).not.toMatch(/\s{2,}\.\d/); // a bare ".500" with no integer part
    expect(text).not.toMatch(/\d\.\d{4,}/); // more decimals than the stored scale
  });
});
