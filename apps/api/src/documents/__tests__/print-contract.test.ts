/**
 * The properties a print copy must have, checked without a browser.
 *
 * A byte-for-byte golden answers "did this change?"; it cannot answer "is this
 * still printable at all?", because the baseline would be re-blessed along with
 * the defect. These assertions are the ones that must hold on every future
 * template, whatever it looks like:
 *
 * - **It is a document, not a web page.** No scripts, no linked stylesheets, no
 *   remote images. The print copy is fetched once and printed; anything it had to
 *   go and fetch would arrive late or not at all, and a `<script>` in a file
 *   served from the API's own origin is a different security question entirely.
 * - **It is A4.** `@page { size: A4 }` with a margin, or the browser invents a
 *   page size and the client's filing cabinet disagrees with the screen.
 * - **It mirrors.** Only logical properties (`inline-start`, `block-end`) may
 *   appear. A physical `padding-left` looks right in French and puts the Arabic
 *   page's columns against the wrong edge — the exact regression the browser test
 *   caught by measuring geometry, caught here without one.
 * - **Its font stack can print Arabic.** Shaping needs an Arabic-capable family in
 *   the stack; without one the browser substitutes and the joins break.
 * A row that must not split across a page break (`break-inside: avoid` on `tr`) is
 * *not* asserted here: neither template carries it today, and asserting it would
 * mean either a red gate or a template change bundled into a commit that is about
 * tests. It is recorded as a follow-up in the session log for 2026-10-19.
 */

import { describe, expect, it } from 'vitest';

import { renderInvoiceHtml } from '../../finance/invoice-template.js';
import { invoice, STANDARD_LINES } from '../../finance/__tests__/invoice-fixtures.js';
import { renderPaperHtml } from '../paper-template.js';
import { PAPERS } from './paper-fixtures.js';

type Paper = 'invoice' | keyof typeof PAPERS;

/** One document per template family, in the locale that is hardest to get wrong. */
function documents(): readonly { name: Paper; html: string; arabic: string }[] {
  const papers = (Object.entries(PAPERS) as [keyof typeof PAPERS, (locale: 'fr' | 'ar') => Parameters<typeof renderPaperHtml>[0]][]).map(
    ([name, build]) => ({
      name: name as Paper,
      html: renderPaperHtml(build('fr')),
      arabic: renderPaperHtml(build('ar')),
    }),
  );

  return [
    {
      name: 'invoice' as Paper,
      html: renderInvoiceHtml(invoice('fr', 'STANDARD', STANDARD_LINES)),
      arabic: renderInvoiceHtml(invoice('ar', 'STANDARD', STANDARD_LINES)),
    },
    ...papers,
  ];
}

/** The `<style>` block, which is where every layout decision lives. */
function cssOf(html: string): string {
  const match = /<style>([\s\S]*?)<\/style>/.exec(html);
  if (match === null) throw new Error('A print copy without a stylesheet would print as plain text.');
  return match[1]!;
}

describe.each(documents().map((doc) => [doc.name, doc] as const))('%s print copy', (_name, doc) => {
  it('carries no script, no linked stylesheet and nothing to fetch', () => {
    for (const html of [doc.html, doc.arabic]) {
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(/<link\b/i);
      expect(html).not.toMatch(/\bsrc\s*=\s*["']https?:/i);
      expect(cssOf(html)).not.toMatch(/url\(\s*["']?https?:/i);
      expect(cssOf(html)).not.toMatch(/@import/i);
    }
  });

  it('declares an A4 page with a margin', () => {
    for (const html of [...[doc.html, doc.arabic]]) {
      const css = cssOf(html);
      expect(css).toMatch(/@page\s*\{[\s\S]*?size:\s*A4/);
      expect(css).toMatch(/@page\s*\{[\s\S]*?margin:\s*\d+mm/);
    }
  });

  it('uses logical properties only, so Arabic mirrors instead of breaking', () => {
    for (const html of [doc.html, doc.arabic]) {
      const css = cssOf(html);

      // Physical axes: the whole reason ADR 0009 exists. `margin: 0 auto` and
      // `border-collapse` are fine; an *inline axis* named by a physical side is not.
      expect(css).not.toMatch(/(?:padding|margin|border|inset)-(?:left|right)\b/);
      expect(css).not.toMatch(/(?:^|[^-])\bfloat\s*:/);
      expect(css).not.toMatch(/text-align\s*:\s*(?:left|right)\b/);
      expect(css).not.toMatch(/(?:^|[;{\s])(?:left|right)\s*:/);
      // And it does mirror: `start`/`end` or a logical inset must be doing the work.
      expect(css).toMatch(/text-align\s*:\s*(?:start|end)\b|-inline-(?:start|end)/);
    }
  });

  it('names an Arabic-capable family, so shaping does not depend on substitution', () => {
    expect(cssOf(doc.html)).toMatch(/font-family:[^;]*Arabic/i);
  });

  it('sets the direction from the locale', () => {
    expect(doc.html).toMatch(/<html lang="fr" dir="ltr">/);
    expect(doc.arabic).toMatch(/<html lang="ar" dir="rtl">/);
  });
});
