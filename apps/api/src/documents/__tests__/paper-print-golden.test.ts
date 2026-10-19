/**
 * The five operational papers, as print goldens.
 *
 * Three locales each — `fr`/`en`/`ar` × `STANDARD` — which is the matrix
 * `docs/specs/001-first-business-and-core-slice.md` sets for a non-fiscal paper:
 * what varies per type is its header, its field set and its series, not its tax
 * presentation. Arabic is the one that matters most, because an RTL document laid
 * out left-to-right still looks plausible in every screenshot and is wrong on
 * every line.
 *
 * Browserless, so it runs in `pnpm verify`. Pagination and glyph shaping are the
 * browser gate's business (`pnpm test:golden`); content and markup are this one's.
 */

import { describe, expect, it } from 'vitest';

import { comparePrintToGolden } from '../../common/print-golden.js';
import type { Locale } from '../../finance/terminology.js';
import type { PaperView } from '../paper-document.js';
import { renderPaperHtml } from '../paper-template.js';
import { PAPERS } from './paper-fixtures.js';

const LOCALES = ['fr', 'en', 'ar'] as const;

describe('operational paper print copies', () => {
  for (const [name, build] of Object.entries(PAPERS)) {
    for (const locale of LOCALES) {
      it(`prints the ${locale} ${name} byte for byte`, () => {
        comparePrintToGolden(renderPaperHtml(build(locale)), `${name}-${locale}`);
      });
    }
  }

  it('states each paper’s own kind on it, and no other paper’s', () => {
    // The five papers share one template, so the failure this guards is a paper
    // that prints the wrong title after a copy-paste in the `kind` switch. A byte
    // comparison against its own golden cannot see that: the wrong title would
    // have been re-blessed into the golden. Naming the expected title is what
    // makes it visible, and asserting no *other* title appears is what keeps the
    // check from passing on a template that prints all five.
    const titles: Record<keyof typeof PAPERS, string> = {
      'sales-order': 'COMMANDE CLIENT',
      'purchase-order': "BON D'ACHAT",
      'delivery-note': 'BON DE LIVRAISON',
      'goods-receipt': 'BON DE RÉCEPTION',
      'production-order': 'ORDRE DE FABRICATION',
    };

    for (const [name, build] of Object.entries(PAPERS) as [
      keyof typeof PAPERS,
      (locale: Locale) => PaperView,
    ][]) {
      const html = renderPaperHtml(build('fr'));

      // The title reaches the page escaped, so the apostrophe in "BON D'ACHAT"
      // arrives as `&#39;`. Comparing the printed form is what proves escaping
      // happened rather than asserting it in prose.
      const printed = (title: string): string => title.replace(/'/g, '&#39;');

      expect(html, `the ${name} paper should print its own title`).toContain(printed(titles[name]));

      for (const [other, title] of Object.entries(titles)) {
        if (other === name) continue;
        expect(html, `the ${name} paper should not print the ${other} title`).not.toContain(
          printed(title),
        );
      }
    }
  });
});
