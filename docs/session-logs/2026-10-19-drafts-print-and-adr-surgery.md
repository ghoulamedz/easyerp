# 2026-10-19 — a draft prints, and a 404 that was two bugs

Session on the report *"`NOT_FOUND: Cannot GET /api/sales/invoices/<id>/pdf` when
viewing or printing a document"*, plus the ruling that **viewing and printing must
work for every paper type, in Draft, and that editing an issued document must be
blocked**. ADR 0009 and ADR 0013 were deleted on the operator's instruction, with the
rule they carried replaced by ADR 0018.

## The 404 was two defects, not one

1. **The link pointed at a route that no longer exists.** `document-list.tsx` built
   `/api<endpoint>/<id>/pdf` from a `PDF_ENDPOINTS` allow-list of two endpoints. The
   renderer was removed in `6ee8720` and every paper has served `/:id/print` since, so
   the list linked every row at a 404 of its own making.
2. **Two print routes had no `:id` in their path.** `sales.controller.ts` declared
   `@Get('orders/print')` and `@Get('delivery-notes/print')` while the handlers read
   `@Param('id')`. Nest passed `undefined`, and the route answered for "no document".
   This type-checks, boots and is invisible until someone prints an order.

The second is recorded by a new gate, `apps/api/src/__tests__/print-routes.test.ts`,
which scans every controller: a handler reading `@Param('id')` must sit under a route
whose path names `:id`, and there must be seven `/:id/print` routes. Verified by
reverting the decorator: 2 of 3 assertions fail, then pass.

## A draft prints

The ISSUED-only gate is gone from all seven papers. It rested on "a draft has no
number to print", which is true and irrelevant: the figures are stored on the draft row
(`createDraft` prices the lines and writes the totals and the `document_tax` rows in the
same insert), so the paper is a view of a real row, and *"what will this look like"* is
asked **before** issuing.

What a draft must never do is read as a filed document, so the views carry
`status: DocumentStatus` and both templates print a watermark — BROUILLON / DRAFT /
مسودة, and ANNULÉ / CANCELLED / ملغاة — with the number cell left empty. The words live
in `finance/terminology.ts` beside the other printed vocabulary, and the CSS uses
`inset-block-start` / `inset-inline-start` so Arabic mirrors (the contract test forbids
physical properties and now also asserts the watermark in all three locales).

`NOT_FOUND` now means exactly one thing on every paper: no such document of that type.

## Defects A and B fixed

- `renderParty` in `finance/invoice-template.ts` printed the name and address only, so a
  fiscal invoice carried neither party's *matricule fiscal* while the operational papers
  had printed it all along. It now prints the identifier, skipping the element when a
  party has none.
- `salesOrderPaperView` passed `taxGroups: []`, so a Sales Order showed HT and TTC with
  the VAT unexplained. It now prints the stored per-rate rows. That needed
  `taxGroups` on `salesOrderSchema` and `taxes` in the service's two queries —
  `documentTaxGroupSchema` also moved above its first use, which the build caught as a
  TDZ error at import time.

Both `it.fails` blocks are now real assertions, and the gate is `179 passed` with no
expected failures.

## The interface

`document-list.tsx` offers **Edit** (draft only), **View** (when the page names a detail
screen) and **Print** (always). The Edit link had been dead code: `showEdit` was computed
and never rendered, so no draft could be opened from any list. `detailBaseHref` was added
to the seven list pages — `customer-invoices` points at `/invoices`, which is where its
detail screen lives.

The `payments/[id]` page had an "Archive" card and two i18n keys describing a feature
deleted in `6ee8720`; the card and the keys are gone.

## ADRs

- **Deleted** `0009-three-locales-with-rtl.md` and `0013-two-deployment-targets.md`, on
  the operator's ruling. Their surviving facts did not vanish with them: ADR 0001 now
  says "built from the same release commit" in place of the image, ADR 0002 states that
  production PostgreSQL is a distribution package under systemd **by default and a
  container where that is the better tool** (Docker is no longer forbidden), and the
  pooling rule lives in `docs/deploy-vercel-neon-free.md`.
- **Added** `0018-a-draft-prints-and-issued-is-read-only.md`: a draft prints with its
  status word, a draft is edited on the screen that created it with Save and Issue as its
  two exits, and an issued document is read-only everywhere.
- Every comment that cited 0009 or a golden gate was rewritten; both referenced things
  that no longer exist.

## Gates actually run

| Command | Result |
| --- | --- |
| `pnpm verify --force` | 16/16, exit 0, 21.6 s |
| `pnpm test:integration` | 11 files, **134 passed**, 44 s (was 131) |
| `pnpm --filter @easyerp/api exec vitest run` | 13 files, **179 passed**, 0 expected failures |
| `pnpm --filter @easyerp/web exec vitest run src/components/document-list.test.tsx` | 21 passed |
| `apps/api/src/__tests__/print-routes.test.ts` reverted-decorator check | 2 assertions fail before the fix |

Not run: `pnpm --filter @easyerp/web test:e2e` (needs a production build and a live API).

## Still open

1. **The create/edit screens are not yet one screen.** Drafts can be edited for Sales
   Orders, Purchase Orders and Production Orders; customer invoices, credit notes,
   delivery notes and goods receipts have a create route and no edit route, and each type
   still ships a `*Form` and a `*EditForm` that differ by ~110 lines. The pattern ADR 0018
   names — one component, `id?` prop, Save and Issue — is not implemented.
2. The `it.fails` removal leaves the fiscal invoice printing a tax identifier that no
   human has reviewed the *placement* of; the wording came from the paper template, so it
   is consistent, not approved.
3. Pagination and glyph shaping are still only measurable from PDF bytes and
   `measureText`; no automated test exists.
