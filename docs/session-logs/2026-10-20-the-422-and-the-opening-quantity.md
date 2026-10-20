# 2026-10-20 (later) — the 422, the duplicate buttons, and an Item's opening quantity

Reported from using the demo: a 422 on *create sales order*, two create buttons on
every empty list, no way to give an Item a starting quantity, no Edit link for
Items, and a `/setup` that shipped the TVA presets only in local development.

## The 422 was mine, and it was one missing key

The unified Sales Order form I wrote in the previous session dropped `businessId`
from its create body. `draftSalesOrderSchema` is a `strictObject` that names it, so
every create answered 422 — and the form printed nothing, because it read
`response.ok` and `data.message` instead of going through `apiSend`, whose
`ApiError` carries the server's already-localized message. Two defects in one
submit path:

- **The body was incomplete.** `{ businessId, ...payload }` on create. The Purchase
  Order form had the same hole (`draftPurchaseOrderSchema` also names `businessId`).
- **Refusals were silent.** All three order forms now `await apiSend(...)` and let it
  throw, so the API's explanation reaches the reader instead of "Save failed".

Both are gated: `sales-order-unified.test.tsx` asserts the POST body equals
`{ businessId, partyId, lines }` — reverting the fix fails it (verified).

The empty-database case is now refused *before* the request: with no Customer or no
Item the selects are disabled, the submit buttons are disabled, and the form says
which one to create. A fresh install could previously only learn this from a 422.

## Two create buttons on an empty list

`DocumentList` rendered `newKey` ("New sales order") *and* `addFirstKey` ("Add the
first order"), both linking at `/new`. The empty state now says it once, in the
friendlier words, and the non-empty list carries the "New …" button — which it did
not have at all. `document-list.test.tsx` counts the links: 1 on an empty list, and
the two names never appear together. Re-adding the second link fails the test
(verified).

## An Item's opening quantity is a ledger entry

The tempting shape was a column on `Item`. That would have been wrong twice: ADR 0004
says on-hand is derived and the ledger is the only place a quantity lives, and a
column would have made the catalog and the inventory two sources of truth.

So `initialQuantity` is **create-only input**, not storage:

- `itemCreateSchema = itemInputSchema.extend({ initialQuantity })` — absent from the
  schema an edit parses, and both are `.strict()`, so a PATCH carrying it is refused
  by name (422) rather than ignored.
- `ItemService.create` writes the Item row *and* the `OPENING_BALANCE` entry in one
  interactive transaction, through `StockLedgerService.appendEntry` — the same
  lock, sequence and audit row as every other movement. A failed opening cannot
  leave an Item whose quantity silently never landed.
- Zero (or omitted) writes no entry: an Item that starts empty has nothing to
  explain, and the stock screen still shows it.
- `CatalogModule` imports `InventoryModule` for the service; the dependency runs one
  way.

The edit screen shows the Item's **on-hand**, read from its ledger entries, in the
same box — disabled, with "Quantity is corrected from the Stock screen." beneath it.

Four integration tests cover it: the entry and its audit row, the zero case, a
negative refusal, and a PATCH that carries `initialQuantity` being refused.

## The Item list had no Edit link

`/items/[id]/edit` existed and was linked from nowhere — the same dead-route defect
the document lists had. The list now offers **Edit** to a session holding
`item:update`, and hides it otherwise (`items-list.test.tsx`, both directions).

## `/setup` starts from the Tunisian facts everywhere

The units and the three VAT rates were gated on `NODE_ENV === 'development'`, so the
demo and any client's first `/setup` opened an empty form and asked a person to
invent `TVA19` from memory before they could add an Item.

Now prefilled on **every** deployment: country `TN`, currency `TND`, units `KG`
(fractions) and `PIECE` (none), Tax Rates `TVA19`/`TVA13`/`TVA07`. The company's own
identity — token, legal name, address, administrator password — stays
development-only, because prefilling a real deployment with a plausible token or
password ships it in the bundle. `setup-screen.test.tsx` runs under `NODE_ENV=test`
(not `development`, i.e. the production condition) and asserts both halves; reverting
the country default to `seed('TN')` fails it (verified).

> `PIECE` is a guess at the code: `Unit` stores only a `code` and prints it, so the
> code *is* the label. Rename it if `PCE` or `U` is what the client writes.

## One implementation per form, again

The previous session added `*-unified.tsx` and left the old `*Form` / `*EditForm`
pairs in place. That is exactly how a create screen and an edit screen drift into
accepting different documents — the 422 was one instance of it. The eight old files
are deleted and their tests ported to the unified components, which also picked up
two regressions the port exposed:

- The unified Sales and Purchase forms let an **issued** order be edited, because
  the draft check fell through to the create defaults. ADR 0018 says read-only
  everywhere; both now refuse with "Only drafts can be edited.".
- That refusal returned from inside `.then()` before `setLoadingRefs(false)`, so the
  refusal rendered as a form that loaded forever. `draft-edit-forms.test.tsx` caught
  it.

## The lint error was a real bug, not a false positive

`@next/next/no-sync-scripts` was reported as an unfixable false positive last
session. It was neither: the rule is `react-hooks/set-state-in-effect` and it was
pointing at `if (id) setLoadingOrder(true)` — a synchronous `setState` in an effect
body, which is a cascading render for a value already known from the props. The
flags are now initialised from `id`, the effect sets nothing synchronously, and the
suppress comments are gone. `pnpm --filter @easyerp/web lint` is **0 errors** (12
pre-existing `exhaustive-deps` warnings).

## Gates

| Command | Result |
| --- | --- |
| `pnpm verify --force` | 16/16, exit 0, 20.9 s, lint 0 errors |
| `pnpm test:integration` | 11 files, **138 passed** (was 134) |
| `pnpm --filter @easyerp/web test` | 30 files, **187 passed** (was 178) |
| `pnpm --filter @easyerp/web test:e2e` | **13 passed** |
| mutation checks | 4 gates verified to fail on the defect they cover |

The database was reset (`pnpm db:reset` + `pnpm db:up`) as instructed. It was not
needed for a schema change — the opening quantity became a ledger entry, so no
column and no migration were added — but the e2e suite needs a database with no
Business in it, and the local one had one.

## Still open

1. Customer Invoices, Credit Notes, Delivery Notes and Goods Receipts still ship a
   `*Form` / `*EditForm` pair and have no draft edit route. Unifying them needs
   `PATCH` endpoints first; the Sales/Purchase/Production pattern is now the template.
2. `apps/web/e2e/global-setup.ts` seeds `PCS` with `allowsFraction: true`, which
   contradicts the rule `/setup` now defaults to. It is a fixture, so it was left
   alone rather than changed under a suite that may rely on fractional pieces.
3. Pagination and glyph shaping still have no automated gate.
