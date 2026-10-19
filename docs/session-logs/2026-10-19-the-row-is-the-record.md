# 2026-10-19 — The row is the record: the PDF renderer and both golden suites are gone

Supersedes the storage half of `2026-10-19-print-everywhere-and-blob-archive.md`
and the whole of the print-golden tier in
`2026-10-19-papers-print-and-archive-unavailable.md`. Those logs stay as written:
they record decisions that were made and then reversed, and the reasons are worth
more than the code they produced.

## What was done

The decision (user ruling): **the database row is the record; printing is a view of
it.** The legal object is the printed A4 page, so a filed copy was never the
artifact — it was a copy that could disagree with its source, written to five
columns that then had to stay writable on an Issued document.

Deleted outright:

- **The renderer.** `finance/pdf.ts` (`isPdfRendererAvailable`, `sharedPdfRenderer`),
  `documents/paper-pdf.service.ts`, `common/pdf-response.ts`, and the
  `playwright-core` dependency that existed to run Chromium.
- **The archive.** `sales/document-archive.ts` (`ArchiveBackend`,
  `DiskArchiveBackend`, `BlobArchiveBackend`, `archiveFromConfig`),
  `finance/paper-archive.ts`, and the `@vercel/blob` dependency. `DOCUMENT_ARCHIVE_ROOT`
  and `BLOB_READ_WRITE_TOKEN` are no longer read by `env.ts`, listed in
  `main.serverless.ts`, set by the deploy workflow, or documented as required.
- **The columns**, in migration `20261019160000_document_row_is_the_record`:
  `archivePath`, `archiveSha256`, `archivedAt`, `printPath`, `printSha256`.
- **Every golden**, both tiers: `common/print-golden.ts` (+test),
  `finance/golden.ts`, `finance/__tests__/invoice.golden.spec.ts` (7 PDF goldens),
  `finance/__tests__/invoice-print-golden.test.ts`,
  `documents/__tests__/paper-print-golden.test.ts` (15 HTML goldens),
  `vitest.golden.config.mts`, `src/__tests__/goldens/`, the `test:golden` scripts,
  and the whole `golden` CI job (which installed Chromium and fonts).

Replaced by `finance/print-copy.ts` — `printInvoiceCopy` builds the invoice or
credit-note view from **stored rows** (never from Items) at read time — and by
`readPrint` on all seven paper services, which resolves the document row inside the
request and returns `NOT_FOUND` for a Draft, because a Draft has no number to print.

## Findings

- **The consistency suite found two real defects, and neither had been visible to
  the goldens.** Both are recorded as `it.fails` and need a human's wording (ADR 0009):
  the fiscal invoice template prints **neither party's tax identifier**
  (`renderParty` writes name and address only, while the operational template does
  print it), and a **Sales Order prints HT/TTC with no VAT row** although its gross
  differs from its net (`salesOrderPaperView` passes `taxGroups: []`). The PDF golden
  had blessed the missing tax identifier for the life of the suite — a re-bless from
  the code that produced it is a baseline that agrees with the code, not with the law.
- **The speedup is not where it was expected.** `pnpm verify --force` measured
  12.6s before this change and 12.5s after (`api typecheck` 3.10s → 2.91s, `api test`
  1.38s → 1.26s). The goldens never ran inside `verify`: they had their own command,
  so deleting them removed a **separate gate**, not time from the fast one. What is
  actually saved is CI (a whole job: Chromium `install --with-deps`, four Noto/DejaVu
  font packages, and up to 20 minutes of wall clock), the local Chromium and font
  setup nobody has to do again, and 27 packages from `pnpm install`. `verify` is
  dominated by the four packages' typecheck/build, not by the tests.
- **Nothing renders off the request path any more.** Issuing writes only the row, so
  there is no window between the commit and the artifact existing, and the five
  columns that had to stay writable on an Issued document are gone with it.
- **`resetDatabase()` left `auth_verification` behind.** The table has no foreign key
  to a user, so nothing cascaded it away: a password-reset or email-change token
  created by one test survived into the next, where Better Auth would honour a token
  the test that created it no longer owns. Found while writing the Neon reset recipe
  (which had the same hole); fixed in `identity/__tests__/harness.ts`.
- A validation-only trap worth remembering: `s.index("invariant(")` found the first
  invariant in the file, not the one in `paperView`, and silently inserted a guard
  into an unrelated method. The TypeScript error (`Cannot find name 'row'`) is what
  caught it.

## Verification actually run

| Command | Result |
| --- | --- |
| `pnpm verify --force` | 16/16 tasks, rc 0, 9.0s warm (three consecutive runs: 8.97 / 9.01 / 9.02s) |
| `pnpm --filter @easyerp/api typecheck` | clean, 2.91s |
| `pnpm --filter @easyerp/api lint` | warnings only (8 pre-existing `exhaustive-deps`) |
| `pnpm --filter @easyerp/api test` | 11 files, 164 passed + 2 expected fail, 1.26s |
| `pnpm --filter @easyerp/api test:integration` | 11 files, 131 passed |
| `pnpm --filter @easyerp/web test` | 177 passed |
| `pnpm --filter @easyerp/web build` | part of `verify`, rc 0 |
| `pnpm --filter @easyerp/web test:e2e` | 13 passed (11.1s), run against a freshly emptied `easyerp_e2e` |
| Golden PDFs / print goldens | deleted; no longer run anywhere |

Integration found three failures on the first pass and all three were real:
`sales-order`/`delivery-note` `readPrint` still filtered `where: { status: 'ISSUED' }`
and answered an `invariant` 500 for a Draft where the spec expects `NOT_FOUND` (fixed
by guarding on `row.status` after the query), and the invoice print assertion expected
a fixture string (`'Carthage'`) that the fixture no longer creates — it now asserts the
customer's actual `name` and all three stored totals.

## Unresolved / next

- **Nothing is committed or pushed** (standing instruction): 46 modified, 43 deleted,
  4 untracked files, all unstaged.
- **Pagination is untested by anything.** `break-inside: avoid` on `tr` is still absent
  from both templates, so a long line can split across pages. Both need a layout engine
  and there is none in the toolchain now; this is caught by printing a long invoice.
- **The two `it.fails` blocks** must be deleted when the defects are fixed, and the
  wording for both needs a human (ADR 0009).
- **`docs/fiscal-build-plan.md`** still plans a "fiscal-year export" that reads rows and
  emits the printed papers. It no longer has an archive module to extend; the export
  should build on `print-copy.ts`.
- **The earlier session logs** describe the archive and the print goldens as
  implemented. They are superseded, not wrong for their date; a reader following them
  today would rebuild what this session deleted.
