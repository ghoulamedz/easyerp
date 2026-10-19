# Papers: print/download for every document, and the INTERNAL_ERROR that wasn't a database problem

Date: 2026-10-19

## What the user reported

Two things, on the Vercel + Neon demo:

1. `/setup` was reachable (fixed earlier, commit `5738064`), but the setup form's
   hint text leaked the env-var name, and the field was labelled "First-run
   token" rather than something a Business buyer would recognise.
2. Viewing or printing a document answered
   `{"error":{"code":"INTERNAL_ERROR","message":"The request could not be completed"}}`.

## The diagnosis (the important part)

`INTERNAL_ERROR` is `DomainExceptionFilter`'s catch-all for anything that is not a
`DomainError`, a `ZodError` or an `HttpException`. Draft documents were never the
cause: `readArchive` already threw a typed `NOT_FOUND` for a non-`ISSUED` row.

The actual path: for an **Issued** document whose archived bytes were missing,
`readArchive` fell back to `renderAndArchive()` → `sharedPdfRenderer()` →
`chromium.launch()`. On Vercel there is no Chromium and the archive root is
ephemeral `/tmp`, so the launch raised an untyped error and the client got the
generic body. The fallback assumed a VPS with a browser and a persistent disk.

**The archive is the only render store now.** A missing archive answers the typed
`ARCHIVE_UNAVAILABLE` (404) with an operator-facing message; there is no
re-render. That is both the fix for the reported error and the honest answer —
a deployment that cannot render must say so, not pretend.

## What was built

- `ARCHIVE_UNAVAILABLE` added to `apps/api/src/common/errors.ts`, mapped to 404,
  with a localized message in `apps/web/src/lib/error-messages.ts`.
- `apps/api/src/documents/` gained the operational-paper pipeline:
  `paper-document.ts` (the render model), `paper-template.ts`,
  `paper-builders.ts`, `paper-pdf.service.ts` (render + archive at issue,
  serve from archive on view), plus `common/pdf-response.ts` for the shared
  response shape (PDF, `attachment`, sha256 ETag).
- Every paper now has `GET …/:id/pdf`: sales orders, delivery notes, purchase
  orders, goods receipts, production orders — alongside the existing
  customer-invoice and credit-note endpoints.
- Papers are archived at issue, after the commit, and a render failure is logged
  rather than fatal: a renderer outage must not strand a numbered document.
- Web: `paper-detail.tsx` (real data via `lib/api`, Download = blob fetch of the
  `/pdf` bytes, Print = the same blob in one hidden iframe) and detail pages for
  all six papers.
- Setup copy: the token field is "License key" (fr *Clé de licence*, ar *مفتاح
  الترخيص*) and the `FIRST_SETUP_TOKEN` hint paragraph is gone.

## Finding that only the integration gate could catch

`PaperPdfService` injected `DocumentArchive` through an `import type`. Because
`emitDecoratorMetadata` erases a type-only import, the parameter was recorded as
`Function` and `NestFactory.create(AppModule)` aborted (SIGABRT) — every unit
test, lint and typecheck passed. Fixed by making it a value import, with a
comment naming the cause. This is the same class of failure AGENTS.md records for
esbuild, and it is why "the API actually starts" is a separate gate.

## Gates actually run

| Command | Result |
|---|---|
| `pnpm --filter @easyerp/api typecheck` | pass |
| `pnpm --filter @easyerp/api lint` | pass |
| `pnpm --filter @easyerp/api test` | 63/63 pass (7 files) |
| `pnpm --filter @easyerp/api test:integration` | 140 pass, 7 fail — **golden only** |
| `pnpm --filter @easyerp/contracts typecheck` | pass |
| `pnpm --filter @easyerp/web typecheck` | pass |
| `pnpm --filter @easyerp/web lint` | 0 errors, 8 pre-existing warnings |
| `pnpm --filter @easyerp/web test` | 178/178 pass (28 files) |
| `pnpm --filter @easyerp/web build` | pass |
| `node` boot of `dist/app.module.js` | `BOOTED OK` |

The 7 golden failures are **pre-existing and environmental**: reproduced
identically on unmodified `HEAD` (`git stash` → 7 failed / 8 passed). They are
byte-for-byte comparisons against PDFs blessed by a pinned Chromium, and this
machine's fallback build (`chromium_headless_shell-1243`,
ubuntu24.04-fallback) does not produce those bytes. `vitest.integration.config.mts`
picks the golden spec up because its include glob is `src/**/__tests__/**/*.spec.ts`
— a pre-existing overlap worth separating, not fixed here (it is unrelated to
this change and the goldens must not be re-blessed from an unpinned browser).

Also done to make the suite runnable: installed the pinned browser with
`pnpm --filter @easyerp/api exec playwright-core install chromium-headless-shell`.

## New tests

- `apps/api/src/documents/paper-pdf.service.test.ts` (unit, 6 cases): the
  `sendPdf` header contract; archive bytes served with their stored hash;
  `ARCHIVE_UNAVAILABLE` when the bytes are gone; `ARCHIVE_UNAVAILABLE` when no
  path was ever recorded; `NOT_FOUND` for a Draft; and an assertion that a
  missing archive never reaches the renderer again.
- `sales-order.spec.ts` (integration, +3): archives at issue and serves those
  same bytes; refuses a Draft; answers `ARCHIVE_UNAVAILABLE` after the filed
  bytes are deleted.
- `delivery-note.spec.ts` (integration, +2): the quantities-only paper archives
  and serves; refuses a Draft.
- `apps/web/src/components/paper-detail.test.tsx`: Download fetches the `/pdf`
  bytes, Print uses the iframe, a failed archive read surfaces the localized
  message.

No golden tests were added, per the instruction.

## Unresolved / next

- **Print does not work on the Vercel demo and cannot** without a browser in the
  render path or a container with Chromium and a mounted archive. Recorded in
  `docs/deploy-vercel-neon-free.md`.
- The golden spec should be excluded from `test:integration`; the two gates
  measure different things.
- Paper archiving is not covered by an issue-time concurrency test (two issues
  racing on the same archive path), because numbers are unique per document.
