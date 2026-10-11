# 2026-10-09 — Contracts audit, ProductionOrderService fix, Settings sub-pages, all gates green

## What was done

### Contracts audit against ADRs/specs/CONTEXT.md
- Cross-checked every contract file (`numeric.ts`, `permissions.ts`, `pagination.ts`, `catalog.ts`, `documents.ts`, `payments.ts`, `stock.ts`, `bom.ts`, `identity.ts`, `settings.ts`) against all 17 ADRs and Spec 001.
- All contracts are well-aligned:
  - ADR 0003: No `tenant_id` anywhere (single-tenant) ✓
  - ADR 0004: Stock derived from ledger, no balance column ✓
  - ADR 0005: Server resolves prices, `ItemInput` omits prices ✓
  - ADR 0006: Document numbering at issue, `number` nullable ✓
  - ADR 0007: `SessionUser` includes permissions re-read on every request ✓
  - ADR 0008: `customFields` on Item, Party, Document ✓
  - ADR 0009: `localeSchema`, RTL support in contracts ✓
  - ADR 0010: Server-side rendering (implementation, not contracts) ✓
  - ADR 0011: Invoice model carries all TEIF fields ✓
  - ADR 0012: Setup contract exists, token-gated, once-only ✓
  - ADR 0013: Two deployment targets (infrastructure) ✓
  - ADR 0014: `DocumentSchema` with `type` field, shared table ✓
  - ADR 0015: One web client (implementation) ✓
  - ADR 0016: Document `CANCELLED` status, Payment `delete` permission ✓
  - ADR 0017: Credit Note `signedQuantitySchema` (negative) ✓

### ProductionOrderService.createDraft partyId FK violation fix
- **Root cause**: `createDraft` wrote `partyId: business.id`, violating `document_partyId_fkey` (Business ID ≠ Party ID).
- **Fix**: Setup now creates an "Internal Operations" Party (code `INTERNAL`, role `SUPPLIER`). ProductionOrderService queries for this Party by code and uses its ID.
- Updated harness `resetDatabase` to delete BOM and Payment rows before parents (new RESTRICT FKs).
- Added integration test for document lists covering all types, payments, BOMs.

### Settings sub-pages implemented (server page + client list pattern)
All 6 Settings sub-pages rewritten:
- **Units** (`/settings/units`) — list with code, allowsFraction, active status
- **Number Patterns** (`/settings/number-patterns`) — list with pattern, padding
- **Modules** (`/settings/modules`) — list with toggle switch (read-only, `business-settings:update` permission)
- **Labels** (`/settings/labels`) — list with entityType (DOCUMENT/TAX_RATE), entityCode, locale, value
- **Users** (`/settings/users`) — list with displayName, email, active, roles
- **Roles** (`/settings/roles`) — list with name, code, permission count, protected flag

Each follows the server-page + client-list component pattern with permission-gated New actions, 3-locale i18n.

### Verification (actually ran)
- `pnpm --filter @easyerp/web typecheck` — clean
- `pnpm --filter @easyerp/api typecheck` — clean
- `pnpm verify` — 15/15 tasks successful
- `pnpm test:integration` — 12 test files, 137 tests passed against real PostgreSQL

## Strongest findings
- The ProductionOrderService bug was a schema/contract mismatch: `partyId` requires a Party, not a Business. The fix creates the missing internal Party at Setup time — the minimal change that satisfies the FK.
- The contracts audit confirmed zero drift: every ADR decision is encoded in the Zod schemas.
- The Settings sub-pages reuse the same generic list pattern (server page for metadata, client component for data/permissions), keeping the codebase lean.

## Unresolved / next
- Settings screens are read-only lists; create/edit/detail screens are placeholders for future stories.
- Web e2e tests not run (need Playwright install + fonts).
- Contracts audit is complete; no further action needed there.