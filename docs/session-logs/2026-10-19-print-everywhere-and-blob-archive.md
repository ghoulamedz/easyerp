# 2026-10-19 — Printing that works everywhere, and an archive that can survive Vercel

## The question

The Vercel demo could not print any paper. Every one of the seven document types
(Invoice, Credit Note, Sales Order, Delivery Note, Purchase Order, Goods Receipt,
Production Order) is rendered by Chromium at issue and filed on disk, and a
serverless function has neither. The demo answered the typed
`ARCHIVE_UNAVAILABLE` instead of the old opaque `INTERNAL_ERROR`, which was
honest but not a feature.

Three routes were weighed:

| Route | Verdict |
| --- | --- |
| Bundle Playwright's Chromium | 261MB alone against a 250MB uncompressed function limit, and Vercel's runtime lacks `libnss3`/`libatk`/`libgbm` — the binary cannot launch |
| `@sparticuz/chromium` | Works, but needs `if (isVercel)` — forbidden by ADR 0013 — plus ~100MB decompressed into `/tmp` on every cold start |
| **Serve print-ready HTML** (chosen) | One path, no branching, no bundle growth, RTL and fonts handled by the browser, identical on every target |

## What was built

**Two copies, two facts** (ADR 0010, amendment). At issue the paper is rendered
once and filed as `html` *always* and `pdf` *only where a browser exists*:

- `html` — self-contained, `@page { size: A4 }`, its own stylesheet, no
  subresources. `GET <paper>/:id/print` serves the *filed* bytes (never a
  re-render, same rule the PDF already had), and the web app loads them into a
  hidden iframe for the browser's print dialog.
- `pdf` — unchanged artifact; `isPdfRendererAvailable()` asks a capability
  question once per process instead of paying for a launch that cannot succeed
  per document.

Two new nullable columns (`printPath`, `printSha256`) rather than a second table:
the immutability trigger compares named content columns, so they stay writable on
an Issued document for the same reason the three archive columns already are.

**Storage became a backend** behind one interface (`ArchiveBackend`):
`DiskArchiveBackend` (a directory, `DOCUMENT_ARCHIVE_ROOT`) and
`BlobArchiveBackend` (Vercel Blob, `access: 'private'`, `allowOverwrite: false`).
`archiveFromConfig` picks one from configuration at the composition root; no
service knows which it is on. This is the ADR 0013 amendment: `BLOB_READ_WRITE_TOKEN`
joins `DATABASE_URL` and TLS on the list of things a deployment supplies — a
configuration fact any host could supply, not a target check.

**Download degrades honestly.** On a host with no PDF, Download no longer dead-ends:
it shows a localized sentence (fr/en/ar) and opens the print dialog, whose "Save
as PDF" produces the same paper from the filed HTML.

## Two gates that were red for everyone, fixed

- **`test:e2e`** assumed a database that already contained `admin@test.com`. On a
  fresh database — what CI has — sign-in could never succeed, and the earlier
  `/setup` redirect turned that into ten cryptic `expected /fr/dashboard` failures.
  A Playwright `globalSetup` now seeds the Business through the real
  `POST /api/setup` (the same transaction a customer's first minute produces) and
  fails fast with one message when the database already has a Business, because
  that is the case the suite must not mutate. 13/13 pass on a fresh database.
- **The golden suite ran inside `test:integration`**, so the database gate failed
  for a differently built Chromium. It has its own config and its own command;
  the integration config now excludes `*.golden.spec.ts` so each gate reports its
  own failures.

## Strongest findings

1. **A capability probe is not a target branch.** `isPdfRendererAvailable()` keeps
   the ADR 0013 promise intact where `if (isVercel)` would have broken it, and it
   is *more* correct: a laptop, a container and a VPS all get PDFs.
2. **`ARCHIVE_UNAVAILABLE` was the right error and the wrong product.** Being
   honest about a missing file is not the same as having nothing to serve; the
   HTML copy is what makes the honest error unnecessary.
3. **The e2e gate was proving nothing.** It passed or failed on a fixture a
   developer happened to have. A gate whose input is accidental state is a gate
   that will be green in the one situation that matters and red everywhere else.
4. **`import type` in a Nest constructor is a boot-time bug.** Already learned in
   `438dcb6`; `PaperPdfService` uses a value import for `DocumentArchive` and
   `src/__tests__/app.module.spec.ts` asserts the metadata exists.

## Artifacts

- Migration `20261019120000_document_print_copy` (two nullable columns).
- `apps/api/src/common/print-response.ts` — `sendPrint`, with a CSP narrow enough
  that the paper's inline stylesheet survives and nothing else can run.
- `apps/api/src/sales/document-archive.ts` — backends, `read()`, `archiveFromConfig`.
- `apps/api/src/finance/paper-archive.ts` — filing and reading for the two fiscal papers.
- `apps/web/e2e/global-setup.ts` — the e2e fixture.
- ADR 0010 and ADR 0013 amendments; `docs/deploy-vercel-neon-free.md` rewritten
  around "print works here, Download needs one flag".

## Unresolved / next

- **The demo has no archived PDFs, by design.** Restoring them means running the
  API in a container with Chromium, which is a deployment-shape decision, not a
  flag. `test:golden` remains the VPS/laptop gate for PDF fidelity.
- **The Blob backend is verified at the HTTP-contract level only** (keys, refusal
  to overwrite, the choice made from config); it has not been exercised against a
  live Blob store, because none is reachable from this machine. First real run on
  the demo should confirm `put` with `access: 'private'` and a `get` round-trip.
- **Seven golden byte diffs** persist locally: the local Chromium build differs
  from the one that blessed the PDFs. Verified identical on unmodified `HEAD` by
  stashing; deliberately not re-blessed.
- `pnpm test:e2e` on a working database (one with a Business) stops with the
  explanatory message rather than running. That is the intended behaviour; a
  developer who wants it green points `DATABASE_URL` at a fresh database.

## Tier A: the gate follows the artifact

The print copy is HTML served by the API and printed by the visitor's browser, but
the only test that read a document was still the PDF golden. So the artifact every
deployment depends on had no regression test, while the artifact half of them
cannot produce had a byte-for-byte suite and a browser install. The gate now
matches the artifact (`a600d18`).

**Tier A** — `*-print-golden.test.ts`, inside `pnpm verify`, no browser:

| What | Where | Why |
| --- | --- | --- |
| Print goldens | `src/__tests__/goldens/print/*.html` (22 files, 144K) | 7 invoice documents + 5 papers × 3 locales |
| Shared fixtures | `finance/__tests__/invoice-fixtures.ts`, `documents/__tests__/paper-fixtures.ts` | one matrix, two tiers, so they cannot drift |
| Helper | `common/print-golden.ts` | line diff on failure, explicit re-bless |
| Invariants | `documents/__tests__/print-contract.test.ts` | A4, self-contained, logical properties only, Arabic font stack, `dir` |

**Tier B** — `pnpm test:golden` — untouched. It is the only tier with a layout
engine, so it is the only one that can say anything about pagination and Arabic
glyph shaping. Replacing it with HTML snapshots would have removed the last check
on the thing a client actually files.

The three templates already used logical properties only (`padding-inline`,
`border-block-end`, `text-align: start`), which is why the browserless RTL check
could be an assertion about the stylesheet instead of a measurement. That is the
one happy finding: the discipline ADR 0009 asked for was already in the code, and
it took a test cheap enough to run every commit to make it visible.

### ADR 0011 was wrong about the artifact

The ruling that unblocked this: the legally-held object is the physical A4 paper,
and a TEIF e-invoice is UN/EDIFACT `INVOIC` with a qualified signature — a PDF
emailed to a customer is explicitly *not* it (`docs/tunisia-fiscal-research.md`).
So the PDF was never the fiscal artifact; it was a rendering of one. The ADR now
says so, and keeps the clause that survives: after signing, the print copy is
re-rendered and re-filed so the seal appears on the paper the customer receives.

### Found, not fixed

- **Neither template has `break-inside: avoid` on table rows**, so a long invoice
  may split a row across a page. The assertion that would have caught it was
  written and then removed: making it pass meant changing the template inside a
  test commit and re-blessing PDFs that cannot be verified on this machine. It is
  the first thing to add when the print template is next touched.
- **The PDF tier is now maintenance without a consumer on the demo.** With the
  renderer slated for removal, `pnpm test:golden` and `finance/pdf.ts` are the
  next decision: retire both, or keep them as the VPS-only fidelity gate.
