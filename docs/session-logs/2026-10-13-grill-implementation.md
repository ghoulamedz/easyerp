# Session 2026-10-13 — grill-with-docs implementation (unattended run)

## What was asked
Implement grill Q1–Q10 steps 2–5, fix "sign-in reachable before setup" (all URLs
must funnel to /setup while needsSetup), verify live with curl, `pnpm db:reset`
if needed.

## Commits (this session, on top of e7134c9)
- `4a9255c` dashboard Hello BusinessName, services health copy, rail scroll,
  list-button styling, setup modules checkboxes, settings business PATCH,
  permissions→Users repurpose, role seed, fiscal 409, auth trustedOrigins
- `2ee5f5d` setup-modules + business-PATCH integration tests
- `a91c983` GET /users/me session fix, array-tolerant useCollection, stock
  empty-items fix, payments optional filters, remaining btn fixes
- `a423bee` nav filtering by module state, working modules toggle,
  server-message surfacing on document lists
- `f4e9eda` setup gate on (app) layout + sign-in, self-healing setup roles,
  items/parties/users creation UI, i18n form keys + dead-key purge, form tests

## Strongest findings
- Add buttons were hidden by a session-shape mismatch, not CSS: Better Auth
  `get-session` has no `permissions`; `fetchSession` cast it anyway, so every
  `useHasPermission` was false. Fixed with `GET /users/me` → SessionUser.
- `nest start --watch` rebuild after `touch main.ts` took >2 min and never
  restarted in the window observed — the db.mjs auto-touch is unreliable.
  Real fix: Setup upserts the Administrator role in-transaction (self-healing).
- Pre-existing test "lists every Module with its switch" asserted all-on;
  updated to the Q8 lean default (PRODUCTION off).
- `UID` is a readonly bash builtin — broke one curl probe (`UNIT=1000`).
- Stray worktree changes left alone: `.gitignore` (`.pi/` line), deleted
  `session-opencode-final-desktop-project.md`, `session-ses_latest.md`.

## Live verification (curl, fresh db:reset)
- `/en/sign-in`, `/en/dashboard`, `/en/items` → 307 `/en/setup` while needsSetup
- setup/complete 201 (with modules map), sign-in 200, /users/me full permissions
- party create 201, item create 201, lists return rows
- web unit 94/94, setup+settings integration 26/26

## Still open (for next session)
- `sales-orders/new`, `delivery-notes/new`, `customer-invoices/new`,
  `credit-notes/new`, payments/purchasing/production/bom `new` pages (Add → 404)
- document issue/cancel actions in web; stock CSV/reservations UI; payments allocate UI
- fiscal-lock test with a real document (only no-doc path covered)
- users create/setActive/last-admin + document lifecycle integration tests
- dead `apps/api/src/users.service.ts` (live one is `identity/users.service.ts`)
- `sign-inNotice` copy still says no account exists yet

## Unattended continuation (afternoon)
- `sales-orders/new`: SalesOrderForm (customer select, dynamic lines, no prices
  travel) + page + `orderAddLine` key x3. API gap closed: `id` added to
  `businessProfileSchema` + service (no exact-shape test broke).
- Live: draft create 201 via proxy, server-priced, lists with partyName; page
  renders. Web suite 96/96 (2 new order-form tests).
- Still open: delivery-notes / customer-invoices / credit-notes / payments /
  purchasing / production / bom `new` pages; issue/cancel web actions.

## Unattended continuation (evening)
- `delivery-notes/new` (standalone note, order-linking left for fulfilment UI)
  + `customer-invoices/new` (draft carries document locale): forms, pages, 4
  interaction tests. Web suite 100/100.
- Live: note 201 DRAFT + invoice 201 DRAFT via proxy; both pages render.
- Still open: credit-notes/new, payments/new, purchasing/production/bom new
  pages; issue/cancel web actions.

## Unattended continuation (credit notes)
- Served order lines now carry their row `id` (contracts + 5 builders;
  delivery-note/goods-receipt already did). Precedent, not novelty: a
  correction must name the line it reverses.
- `credit-notes/new`: issued-invoice picker, per-line reversal quantities
  defaulting to billed figures, overdraw refusal stays on screen. 2 tests.
  Web suite 102/102; contracts 98/98; sales-order + delivery-note + lists
  suites green.
- Environmental: 11 customer-invoice issue/immutability tests need Playwright
  chromium (PDF at issue); download blocked here, fail identically on master.
  Live credit-note draft unverified end-to-end for the same reason (no issued
  invoice obtainable); route proven via named NOT_FOUND + page render.
- Still open: payments/new, purchasing/production/bom new pages; issue/cancel
  web actions.

## Unattended continuation (payments)
- `payments/new`: party + amount + date/method/reference/note + allocations to
  the party's issued docs with live remainder; empty allocations stay
  unallocated credit. 2 tests. Web suite 104/104.
- Live: 50.000 receipt allocating 44.625 to the draft invoice, remainder 5.375.
- Still open: purchasing/production/bom new pages; issue/cancel web actions.

## Worker wave (purchasing/production/actions)
- 3 parallel workers, exclusive files, parent-owned i18n keys (docIssue,
  prodBomVersion, prodFinishedItem, bomComponent x3).
- purchasing/orders/new (optional supplier), production/orders/new (BOM version
  picker), boms/new (shell + first version, unit selects); 8 tests.
- DocumentList issue/cancel per-row buttons, wired per controller routes:
  sales+purchase+production issue&cancel; delivery/invoice/credit issue only.
  Web suite 114/114.
- Live: supplier party, PO draft, PRODUCTION toggle on, BOM v1, production
  draft, all new pages render; cancel-on-draft 409 + issue-no-stock
  INSUFFICIENT_STOCK both named (wiring proven).
- Still open: goods-receipts UI (no list page), order-linked receipts/notes,
  payments allocation UI polish.

## Worker wave 2 (receipts + payments polish + fiscal plan)
- goods receipts UI (list + new + purchasing-page link); live: receipt
  BR-2026-0001 created, listed, page renders. Receipts are atomic
  create-and-issue (no issue/cancel routes) — worker C correctly omitted props.
- payments: party balance line via /payments/party/:id/balance, silent on failure.
- scout: docs/fiscal-build-plan.md (FODEC core first, then P1/P2 sequenced).
- Web suite 117/117.

## Worker wave 3 (order linking)
- delivery-note + goods-receipt forms: optional linked-order select; ISSUED-only
  for sales (reservations), DRAFT+ISSUED for purchase; prefill remaining
  quantities with link ids; standalone untouched. 2 new tests (remaining-math,
  skip fully-delivered). Web suite 119/119.
- Live: order detail carries line ids + deliveredQuantity (linking
  prerequisite proven). Full issue chain untestable here (PDF needs chromium).

## Worker wave 4 (stock dialogs + e-invoicing plan)
- stock-list: per-row Open/Adjust, stock:adjust-gated, password via same-user
  sign-in check (bare fetch, 401 = wrong password), refetch on success.
  2 tests. Web suite 121/121.
- researcher: docs/fiscal-einvoicing-module.md (E_INVOICING off by default,
  cross-cutting not document-owning, OFF = byte-identical flow).
- Live: wrong password 401; ADJUSTMENT_IN 50 (7.000 -> 57.000 on-hand).

## E_INVOICING scaffold
- MODULES += E_INVOICING (cross-cutting: NOT in MODULE_BY_DOCUMENT_TYPE).
  Setup default false + setup-screen checkbox; backfill migration sets false
  on existing DBs (absent rows read enabled). OFF = byte-identical flow.
- Caught: z.record over enum is total — partial modules maps 422; test fixed.
- Suites: setup+settings 26/26, contracts 98/98, web 121/121.

## FODEC wave (3 workers + parent seam fixes)
- Contracts: fodecSubject (item, default false) + fodecAmount (lines, totals).
  Pricing: net -> 1% FODEC -> VAT base -> tax -> gross, rounded once.
- Persistence: migration (Item.fodecSubject, DocumentLine.fodecAmount, both
  defaulted = backfill), catalog CRUD, all served builders, credit-note carry.
  Delivery-note totals: '0.000' (quantity-only document).
- Display: PDF FODEC row only when non-zero; item-form checkbox.
- Parent fixes: delivery-note totals miss; z.record totality note; VAT prefill
  '0.19' -> '19' (rate means percent; engine was right, seed was wrong).
- Suites: contracts 103, web 122, sales-order/delivery/lists/catalog green;
  11 PDF-issue tests environmental (no chromium).
- Live: FODEC item -> order line fodec 2.000, totals reconcile.

## 7-worker wave (settings/users/stock/docs + 2 scouts)
- Tax rates UI (page + create + retire); fiscal lock REMOVED per owner reversal
  (all settings editable + password confirm); users edit/remove (soft delete,
  last-admin/self guards) + 2 identity tests; stock opening removed;
  View/Print on issued invoice/credit-note rows; stockSetOpening purged.
- Suites: web 138, identity+settings 36/36. Live: fiscal PATCH 200,
  tax-rates list + page render.
- Scout: FODEC ELI5 (3 lines) + docs/deploy-vercel-neon-free.md (15 steps).

## Wave 6 (logout + error i18n + cancel buttons + archive 404 fix + draft edit + logout + tax rates UI + editable settings + users edit/remove + stock adjust-only + doc view/print + deploy guide)
- Logout icon button in header (Better Auth sign-out, redirects to sign-in)
- All creation forms get Cancel link back to list (11 forms)
- API error messages localized by code (fr/en/ar via document.documentElement.lang)
- Order-linked fulfilment drafts: delivery-note + goods-receipt prefill remaining from issued orders
- Archive 404 fixed: delivery-note totals now include fodecAmount: '0.000'
- Tax rates UI (create + retire), Settings fully editable with password, Users edit/remove (soft-delete + last-admin guard), Stock opening removed, View/Print on issued invoices/credit-notes
- Scout: FODEC in 3 lines + docs/deploy-vercel-neon-free.md (15 steps)
- All suites: web 138, contracts 103, integration 26/26

## 6-worker wave (buttons/filters/edits/archive/logout/cancel)
- Status buttons verified present (DRAFT-only Issue, non-CANCELLED Cancel,
  per-controller wiring); refusals localized.
- Archive fallback present from 0e74ecc (stored -> pathFor -> re-render);
  live 404 gone, remaining 500 is no-chromium-here only.
- Filters on all lists (status/type/role/search, client-side where API has
  no query); FilterBar shared + tests. BOM list() spec call fixed.
- Draft edits wired (purchase/prod strict-body fixes, list-prefill for
  no-detail routes, roles/users guards); logout IconLogout present.
- Cancel audit: verified absent on all 26 forms, no changes.
- Suites: web 163, api tsc clean.

## Deploy cleanup wave
- deploy-demo.yml: new demo-cleanup job (branch delete/recreate + migrate,
  runs on smoke success only; YAML validated).
- DEPLOY.md: fresh-setup-every-deploy, creds block removed, redeploy + manual
  reset steps, sign-in placeholders.
- Reviewer P0s noted (env-after-deploy, vercel CLI, URL plumbing) — all match
  known deploy-vercel-neon-free.md flags; mitigation is pre-seeding Vercel env
  manually before first deploy.
