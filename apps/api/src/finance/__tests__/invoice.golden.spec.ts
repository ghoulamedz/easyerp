/**
 * The document golden gate (ADR 0009, ADR 0010).
 *
 * ## What this proves and what it does not
 *
 * It proves layout: that a document renders, that its arithmetic is right, that
 * Arabic mirrors, that a `STANDARD` invoice prints a per-rate breakdown and an
 * `EXEMPT` one prints the mention instead, and that none of it moved. Because the
 * comparison is byte for byte, a changed margin is a failed test rather than a
 * difference nobody notices until a client files the document.
 *
 * It does **not** prove that a tax rate is the right rate, that a rate is current
 * for the issue date, or that the French and English wording reads well. Those are
 * a human's job, and the fixtures below are deliberately marked unreviewed. The
 * labels in `terminology.ts` are the thing under review, not this test.
 *
 * The matrix and the reason it is 3x2-and-one rather than 3x3 is documented in
 * `docs/specs/001-first-business-and-core-slice.md`. Two regimes are a Business
 * fact; three Tunisian rates are line data, exercised by one extra document.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { renderInvoiceHtml } from '../invoice-template.js';
import { compareToGolden, normalisePdfTimestamps } from '../golden.js';
import { PdfRenderer } from '../pdf.js';

import {
  EXEMPT_LINES,
  invoice,
  LOCALES,
  MIXED_RATE_LINES,
  STANDARD_LINES,
} from './invoice-fixtures.js';

let renderer: PdfRenderer;

beforeAll(async () => {
  renderer = await PdfRenderer.start();
});

afterAll(async () => {
  await renderer.close();
});

describe('Customer Invoice golden documents', () => {
  for (const locale of LOCALES) {
    it(`renders the ${locale} STANDARD invoice byte for byte`, async () => {
      const pdf = await renderer.toPdf(
        renderInvoiceHtml(invoice(locale, 'STANDARD', STANDARD_LINES)),
      );
      compareToGolden(pdf, `invoice-${locale}-standard`);
    });

    it(`renders the ${locale} EXEMPT invoice byte for byte`, async () => {
      const pdf = await renderer.toPdf(renderInvoiceHtml(invoice(locale, 'EXEMPT', EXEMPT_LINES)));
      compareToGolden(pdf, `invoice-${locale}-exempt`);
    });
  }

  it('renders the mixed-rate STANDARD invoice byte for byte', async () => {
    const pdf = await renderer.toPdf(
      renderInvoiceHtml(invoice('fr', 'STANDARD', MIXED_RATE_LINES)),
    );
    compareToGolden(pdf, 'invoice-fr-standard-mixed-rates');
  });

  it('reproduces byte for byte within one browser, so a golden is a statement about layout', async () => {
    const html = renderInvoiceHtml(invoice('fr', 'STANDARD', MIXED_RATE_LINES));

    const first = await renderer.toPdf(html);
    const second = await renderer.toPdf(html);

    expect(normaliseBoth(first)).toEqual(normaliseBoth(second));
  });
});

describe('what the documents must contain', () => {
  it('groups the tax breakdown and lets the groups reconcile to the total', () => {
    const view = invoice('fr', 'STANDARD', MIXED_RATE_LINES);

    expect(view.taxGroups.map((group) => group.rate)).toEqual(['19', '13', '7']);
    expect(view.net).toBe('332.000');
    expect(view.tax).toBe('55.640');
    expect(view.gross).toBe('387.640');

    const baseSum = view.taxGroups.reduce((total, group) => total + Number(group.base), 0);
    const taxSum = view.taxGroups.reduce((total, group) => total + Number(group.amount), 0);
    expect(baseSum).toBeCloseTo(Number(view.net), 6);
    expect(taxSum).toBeCloseTo(Number(view.tax), 6);
  });

  it('prints the stored padding in the document number', () => {
    expect(invoice('fr', 'STANDARD', STANDARD_LINES).number).toBe('FA-2026-0042');
  });

  it('shows a breakdown for STANDARD and a mention with no breakdown for EXEMPT', () => {
    const standard = markupOf(renderInvoiceHtml(invoice('fr', 'STANDARD', STANDARD_LINES)));
    const exempt = markupOf(renderInvoiceHtml(invoice('fr', 'EXEMPT', EXEMPT_LINES)));

    expect(standard).toContain('class="vat-table"');
    expect(standard).toContain('Total TVA');
    expect(standard).not.toContain('vat-exempt');

    expect(exempt).not.toContain('class="vat-table"');
    expect(exempt).not.toContain('Total TVA');
    expect(exempt).toContain('vat-exempt');
    expect(exempt).toContain('À FAIRE VALIDER');
  });

  it('keeps stamp duty out of the gross total', () => {
    const view = invoice('fr', 'STANDARD', STANDARD_LINES);

    // 2 x 125.000 @ 19% -> 250.000 + 47.500 ; 80.000 @ 19% -> 80.000 + 15.200
    expect(view.net).toBe('330.000');
    expect(view.tax).toBe('62.700');
    expect(view.gross).toBe('392.700');

    // The 1.000 stamp duty is printed as its own line and is not in the gross.
    expect(view.stampDuty).toBe('1.000');
  });
});

describe('right-to-left', () => {
  it('mirrors the inline-start edge for Arabic and leaves it alone for French', async () => {
    const arabic = renderInvoiceHtml(invoice('ar', 'STANDARD', STANDARD_LINES));
    const french = renderInvoiceHtml(invoice('fr', 'STANDARD', STANDARD_LINES));

    const arabicTitle = await renderer.measure(arabic, '.document-title');
    const frenchTitle = await renderer.measure(french, '.document-title');

    // In LTR the title sits at the inline-start, which is the left edge.
    expect(frenchTitle.x).toBeLessThan(20);

    // In RTL the same element must move to the other edge. A template that used a
    // physical property keeps it on the left, and this is what catches that.
    expect(arabicTitle.x).toBeGreaterThan(arabicTitle.width + 100);
  });

  it('sets the direction attribute from the locale', () => {
    expect(renderInvoiceHtml(invoice('ar', 'STANDARD', STANDARD_LINES))).toContain('dir="rtl"');
    expect(renderInvoiceHtml(invoice('fr', 'STANDARD', STANDARD_LINES))).toContain('dir="ltr"');
  });
});

describe('untrusted text', () => {
  it('renders markup in a description as characters rather than executing it', () => {
    const html = renderInvoiceHtml(
      invoice('fr', 'STANDARD', [
        {
          description: '<img src=x onerror="document.title=\'pwned\'">',
          quantity: '1',
          unitPrice: '10.000',
          taxRate: '19',
        },
      ]),
    );

    expect(html).toContain('&lt;img src=x onerror=');
    expect(html).not.toContain('<img src=x onerror=');
  });
});

function normaliseBoth(pdf: Buffer): string {
  return normalisePdfTimestamps(pdf).toString('base64');
}

/**
 * The document without its stylesheet.
 *
 * Structural assertions run against this rather than the whole HTML because the
 * stylesheet names every class the template can emit — `.vat-table`, `.vat-exempt`
 * — so a substring check on the full document passes against the CSS no matter
 * what the body does. Two assertions in this file were wrong for exactly that
 * reason before this helper existed.
 */
function markupOf(html: string): string {
  return html.replace(/<style>[\s\S]*?<\/style>/, '');
}
