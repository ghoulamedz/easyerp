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
