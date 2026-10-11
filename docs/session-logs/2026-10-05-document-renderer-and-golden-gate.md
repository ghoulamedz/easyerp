# Customer Invoice renderer and the golden gate

## What was done

Built the server-side document renderer the spec and the ADRs promised and no code
delivered, then closed the golden-test gap that had been named in `AGENTS.md` with
no infrastructure behind it.

- `apps/api/src/finance/terminology.ts` — locale, direction, and the label table.
  The template asks for a _code_; wording is data, which is what lets the golden
  test assert layout rather than wording.
- `apps/api/src/finance/invoice-document.ts` — the render model. This is the first
  production caller of `renderDocumentNumber`, so the stored Number Pattern's
  padding now reaches a document instead of sitting unused.
- `apps/api/src/finance/invoice-template.ts` — HTML and CSS. Logical properties
  only; one `dir` attribute flips all three locales.
- `apps/api/src/finance/pdf.ts` — Chromium via `playwright-core`, one browser per
  process, plus a `measure()` used by the RTL test.
- `apps/api/src/finance/golden.ts` — timestamp normalisation and golden comparison.
- `apps/api/src/finance/__tests__/invoice.golden.spec.ts` — 15 tests, 7 committed
  PDFs.
- `pnpm test:golden` wired through `apps/api/package.json`, root `package.json`,
  `turbo.json` and a new CI job.

`pricing.ts` gained a `base` per tax-rate group, because `19% of what` is not
answerable from the tax figure alone and the breakdown a tax authority expects
needs base, rate and amount.

## Strongest findings

**Chromium PDFs are byte-reproducible except for two bytes.** Rendering the same
HTML twice produced identical files apart from the seconds digit in Skia's
`/CreationDate` and `/ModDate`. That is what makes a byte-level golden viable at
all, and it was worth spiking before building anything on the assumption.

**A byte golden needs its normalisation to be assertive.** The normalisation throws
unless it matches exactly those two fields. Without that, a change in the
producer's output would leave the comparison comparing two differently-stamped
files, and the resulting diff would read like a layout regression.

**The missing-font failure mode is silent, and that is the dangerous part.**
Chromium substitutes a fallback face with different metrics rather than erroring.
A host without the Arabic fonts would produce a plausible invoice that is wrong,
and no health check would ever notice. `ops/src/deploy.ts` now refuses to deploy
without the font and the browser, and names the command to fix it.

**`dir="rtl"` is not a test of right-to-left.** A template with one physical
property still emits `dir="rtl"` and still lays out left-to-right. The test measures
the inline-start edge instead, which is the only assertion that catches a mirrored
stylesheet creeping back in.

**Two assertions were wrong before they were run.** `expect(html).not.toContain('vat-table')`
and `not.toContain('vat-exempt')` both passed or failed on the _stylesheet_, which
names every class the template can emit. The helper `markupOf()` strips `<style>`
so a structural assertion cannot match the CSS.

## Verification actually run

- `pnpm verify` — 15/15 tasks, 41 unit tests.
- `pnpm test:integration` — 27/27.
- `pnpm test:golden` — 15/15, 7 goldens.
- `pnpm --filter @easyerp/web test:e2e` — 13/13.
- `pnpm --filter @easyerp/ops test` — 29/29.
- `pnpm format:check` — clean.
- **The gate was proven able to fail:** changing one padding value from `1.6mm` to
  `1.7mm` failed all seven golden comparisons, including the three Arabic ones.
  Reverted, and the suite returned to green.

## Decisions a human should look at

**The EXEMPT mention is a placeholder, deliberately.** `vat.exemptMention` renders
as `[MENTION TVA NON APPLICABLE — À FAIRE VALIDER]`. Writing a plausible Tunisian
phrase nobody reviewed would be worse than writing nothing: ADR 0009 says no legal
text reaches a template before a human approves it, and the golden test now proves
_where the mention appears_, which is the part that is layout. The approved wording
arrives as `Label` rows, which the resolver already reads.

**The three locales are unreviewed translations.** Same reasoning, and ADR 0009
already requires them to be marked as such. The goldens are test artifacts, not
examples of a finished invoice.

**The VAT rates (19/13/7) came from a secondary source** and are unverified. Tunisian
VAT changes with each loi de finances, and the thresholds that decide whether a
small Business is subject to VAT at all were not found in a primary source. This
needs an accountant before anything is shown to a client.

**Chromium was chosen over a pure-Node PDF library, with the costs accepted
deliberately.** A browser and two font packages become a host prerequisite, and a
pinned browser version owns the golden bytes. Recorded in `AGENTS.md` and in
`ops/src/deploy.ts`.

## Unresolved

- No `Label` rows exist yet, so `terminologyFor()`'s unreviewed defaults are what
  every document renders with. Until a Business has terminology, there is one
  place for wording to live and it is code.
- Tax rates are fixture data in the golden spec. Nothing reads `tax_rate` yet.
- The renderer is not wired to an endpoint. Issuing a Customer Invoice, archiving
  the PDF immutably (ADR 0010) and serving it are all still open.
- `provisionedVersion` readiness comparison, Settings/Setup wiring, Neon and Vercel
  deployment: unchanged and still open.
