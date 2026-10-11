# 2026-10-09 — All list screens wired, API + Web gates green

## What was done
### API endpoints
- Added list routes for every Document type (sales orders, delivery notes, customer invoices, credit notes, purchase orders, goods receipts, production orders) via `DocumentListService` injected into existing controllers; preserved `GET /sales/orders/open` as a separate route.
- Added `GET /payments` using `PaymentsService.list`.
- Added `GET /production/boms` returning `BomSummary[]` (finished-item code/name, version count, latest version).
- New migration `20261009150500_purchase_production_bom_tables` created the missing companion tables (`purchase_order`, `purchase_order_line`, `goods_receipt`, `goods_receipt_line`, `discrepancy`, `bom`, `bom_version`, `bom_version_line`, `production_order`, `production_order_line`) and `unallocatedCredit` / `position` columns on `payment` / `payment_allocation`. Trigram search indexes from the catalog migration were intentionally **not** dropped.

### Integration test
- New spec `src/documents/__tests__/document-lists.spec.ts` exercises every list service through the real `AppModule` HTTP stack, seeding via the domain services and asserting paged envelopes, filters, and 401 guard responses. Harness `resetDatabase` extended to delete BOM and payment rows before their parents to satisfy new RESTRICT FKs.

### Web screens (server page + client list component pattern)
- Shared `DocumentList` component for the 7 document types, permission-gated New action, 3-locale i18n keys.
- Bespoke `PaymentsList`, `StockList` (direct `/inventory/stock` call + CSV export button), `BomsList` (direct `/production/boms`).
- All 9 list pages rewritten: `sales-orders`, `delivery-notes`, `customer-invoices`, `credit-notes`, `payments`, `stock`, `purchasing`, `production`, `boms`.

## Verification (actually ran)
- `pnpm --filter @easyerp/web typecheck` — clean.
- `pnpm --filter @easyerp/api typecheck` — clean.
- `pnpm verify` — 15/15 tasks successful.
- `pnpm test:integration` — 11 test files, 137 tests passed against real PostgreSQL.

## Strongest findings
- The migration drift was real and wide: BOM/production/purchase tables never got a migration despite services referencing them. The `prisma migrate diff --from-migrations --to-schema` + shadow DB path produced a clean, reversible script.
- `DocumentListService` worked out of the box once mounted; the shared document table (ADR 0014) means one service + one list component covers all 7 types.
- The `SalesController` route conflict (`GET /orders` → `openOrders` vs new list) was resolved by keeping the open-orders alias at `/orders/open` and moving the paged list to the base path, both behind `sales-order:read`.

## Unresolved / next
- Contracts audit against ADRs/specs/CONTEXT.md still open.
- `ProductionOrderService.createDraft` has a bug: it writes `partyId: business.id` (FK violation). The spec seeds directly; the service fix is a follow-up.
- Settings sub-pages (units, number-patterns, modules, labels, users, roles) still placeholders — same pattern applies.