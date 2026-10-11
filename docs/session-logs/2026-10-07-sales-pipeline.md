# 2026-10-07 — the sales pipeline: Sales Order, Delivery Note, Stock Ledger

## What was done

Implemented the stock-ledger (spec 001 stories 49–57, ADR 0004) and the sales pipeline (stories 33–48) on the ADR 0014 generic `document` table, then proved both with integration tests against real PostgreSQL. The slice shipped with two real defects found by the new tests, not by review.

Artifacts (all uncommitted, as always):

- `apps/api/src/inventory/stock-ledger.service.ts` — append-only ledger with `open` / `adjust` / `reverse`, `positions` (available may be negative), `balanceOf`, `entries`, `listPositions`. Fixed the rough edges from the previous session: a proper `DomainError` import instead of the dynamic `require`, and `createdByUserId` threaded through `AppendEntryInput` from `actor.id ?? null` (`write()` lost its redundant `userId` parameter).
- `apps/api/src/sales/sales-order.service.ts` — `createDraft` / `update` / `issue` / `cancel` / `listOpenOrders` / `findById` / `findByRequiredId`, all on one generic `document` table under `type: SALES_ORDER`. `issue` re-prices (ADR 0005), allocates `BC-…`, locks the Item rows `FOR UPDATE`, and creates one Reservation per goods line. `cancel` releases every open Reservation in the same transaction as the status flip.
- `apps/api/src/sales/delivery-note.service.ts` — `createDraft` / `issue` / `findById`, under `type: DELIVERY_NOTE`. Issue appends `DELIVERY_NOTE` OUT entries, grows `deliveredQuantity` and sets `releasedAt` at full delivery; refuses over-delivery, double-shipping a released line, and a second issue.
- `apps/api/src/sales/sales.controller.ts` + `sales.module.ts`, `apps/api/src/inventory/stock.controller.ts` + `inventory.module.ts`, `app.module.ts` wiring, `BusinessSettingsService` `backorderPolicy`.
- Three new integration specs: `sales-order.spec.ts` (14), `delivery-note.spec.ts` (11), `stock.spec.ts` (9).
- `packages/contracts`: `stockLedgerEntrySchema.createdByUserId` made nullable; the 85 contract tests green.

## Strongest findings

**The new tests found two code defects and one spec defect — each exactly where the design said a bug would hide.**

1. **The ALLOW backorder policy was never implemented.** `issue()` checked `available < quantity` unconditionally and only interpolated the policy name into the error message. Test "books a shortfall as a backorder under ALLOW" failed with _"Available is 0.000 and the ALLOW policy refuses"_. Fixed: the check is `strict && available.lt(...)`. Under ALLOW the Reservation is still created, so the ledger shows the backorder as a negative Available — visible on purpose (ADR 0004).
2. **The immutability trigger forbade cancellation.** `easyerp_refuse_issued_document_mutation` raised on _any_ status change from `ISSUED`, so `cancel` rolled back with "correct it with a Credit Note". Relaxed to allow exactly `ISSUED → CANCELLED` (all content columns still immutable). Re-deployed to both live databases via `CREATE OR REPLACE FUNCTION`; the migration file carries the same body.
3. **My own spec bug:** the `SalesOrder` contract response has no line `id`, so the Delivery Note spec built its fixture on `issued.lines[0].id` (TypeError at runtime). The note's `salesOrderLineId` is the real `document_line` id; the fixture now reads it from the database.

**Two fresh-replay landmines in the migrations, found by replaying them onto a throwaway database** (the right way to test "does a new deployment work"):

1. `20261006111950_generic_document_sales_pipeline` ALTERed `module_state` (making `updatedAt` `TIMESTAMPTZ(3)`), but `module_state` is only CREATEd by the later `20261006120000_module_state` — a fresh database failed at the ALTER. Moved the ALTER into a new migration `20261006150000_module_state_updated_timestamptz`; `db:migrate:all` applied it as a no-op to both live DBs.
2. The trigram GIN indexes use `gin_trgm_ops` but no migration created `pg_trgm` — live DBs only worked because a host init script had created the extension. Fresh replay failed with `operator class "gin_trgm_ops" does not exist`. Added `CREATE EXTENSION IF NOT EXISTS pg_trgm;` to the pipeline migration (before its first index use). A scratch database now replays all 8 migrations cleanly, then gets dropped.

## Verification

- `pnpm test:integration` — **114 tests green across 10 files** against real PostgreSQL with a real started `AppModule`; the 34 new tests pass, including STRICT shortfall rollback, ALLOW negative-Available, two-concurrent-issues distinct numbers, over-delivery refusal, reversed-with-reference, and double-reverse refusal.
- `pnpm verify` — lint, strict typecheck, unit tests and build green across every package (15 tasks), run both before and after `pnpm format`.
- `pnpm test:golden` — 15 PDFs byte-for-byte identical (nothing touched templates).
- `pnpm format:check` — clean (after `pnpm format` tidied 16 files).
- Fresh-database replay of all 8 migrations — clean, on a scratch DB that was then removed.

## Open / unresolved

- **Checksum drift inside a live database's `_prisma_migrations`:** the pipeline migration was edited after it had already been applied (trigger body, minus the `module_state` ALTER, plus `CREATE EXTENSION`). `prisma migrate deploy` is checksum-lenient and every workflow here uses deploy, so nothing breaks — but a future `prisma migrate dev` on these databases would report "migration was modified after being applied". If that ever bites, the paths are a fresh container (the migrations themselves now replay cleanly) or a checksum reconcile.
- **Delivery Note archival deferred (deliberate):** a note is numbered and immutable but archives no PDF — stock lives in the ledger, not in a file (ADR 0017 sibling decision). A "print the note" step is future work.
- **No stock web UI yet**: the CSV endpoint and ledger positions are API-only; the web screens belong to a later slice.

## Next steps

1. Payments / balance against the `document` ledger (ADR 0016: documents cancelled, payments deleted), then the Credit Note (which corrects an Issued invoice by _issuing a new document_ and never moves stock — ADR 0017).
2. Purchasing slice (Purchase Order, Goods Receipt against the same ledger), then Production / BOM consumption.
3. Stock UI and a dashboard route, then the web e2e gate tied to a real API-first stack (the Q6 shape documented in the 10-03 session log).

## Files worth reading first

- `apps/api/src/sales/sales-order.service.ts` — the `STRICT`/`ALLOW` split inside `issue()` and the reservation loop keyed on documented positions.
- `apps/api/src/sales/delivery-note.service.ts` — the over-delivery guard against `quantity - deliveredQuantity`, and the "note is not fiscal" comment.
- `apps/api/prisma/migrations/20261006111950_generic_document_sales_pipeline/migration.sql` — the immutable-issued trigger with its one permitted transition.
