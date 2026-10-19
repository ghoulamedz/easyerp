/**
 * The print golden gate, browserless: the same matrix as the PDF goldens, one
 * tier cheaper.
 *
 * What this proves: that every invoice the browser gate renders is still the
 * document it was — the numbers, the tax breakdown per rate, the exemption
 * mention, the stamp duty line, the labels in three languages, the Arabic
 * `dir="rtl"`, and every byte of markup around them. A changed margin is a failed
 * test; a lost FODEC row is a failed test; a price that moved is a failed test.
 *
 * What it does not prove: that the page *paginates* as intended, and that Arabic
 * glyphs shape and join. Those need a layout engine and are what
 * `invoice.golden.spec.ts` covers through Chromium.
 *
 * It runs in `pnpm verify` — no browser, no font package, milliseconds — which is
 * the point: the cheap gate should carry everything the cheap gate can, so the
 * browser gate is not the only thing standing between a template edit and a
 * client's filed document.
 *
 * The matrix, and why it is 3x2-and-one rather than 3x3, is in
 * `docs/specs/001-first-business-and-core-slice.md`.
 */

import { describe, expect, it } from 'vitest';

import { comparePrintToGolden } from '../../common/print-golden.js';
import { renderInvoiceHtml } from '../invoice-template.js';
import { EXEMPT_LINES, invoice, LOCALES, MIXED_RATE_LINES, STANDARD_LINES } from './invoice-fixtures.js';

describe('Customer Invoice print copies', () => {
  for (const locale of LOCALES) {
    it(`prints the ${locale} STANDARD invoice byte for byte`, () => {
      comparePrintToGolden(
        renderInvoiceHtml(invoice(locale, 'STANDARD', STANDARD_LINES)),
        `invoice-${locale}-standard`,
      );
    });

    it(`prints the ${locale} EXEMPT invoice byte for byte`, () => {
      comparePrintToGolden(
        renderInvoiceHtml(invoice(locale, 'EXEMPT', EXEMPT_LINES)),
        `invoice-${locale}-exempt`,
      );
    });
  }

  it('prints the mixed-rate STANDARD invoice byte for byte', () => {
    comparePrintToGolden(
      renderInvoiceHtml(invoice('fr', 'STANDARD', MIXED_RATE_LINES)),
      'invoice-fr-standard-mixed-rates',
    );
  });

  it('produces the same bytes twice, so a golden is a statement about the template', () => {
    // Without this, a golden could pass while the renderer was nondeterministic —
    // a `Date.now()` in a footer would make it fail intermittently instead, which
    // is the worst version of this gate: red for no diagnosable reason.
    const html = renderInvoiceHtml(invoice('fr', 'STANDARD', MIXED_RATE_LINES));

    expect(renderInvoiceHtml(invoice('fr', 'STANDARD', MIXED_RATE_LINES))).toBe(html);
  });
});
