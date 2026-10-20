# 2026-10-20 (third) — the last four forms, and a sidebar that ignored the Module switch

Two requests: finish the create/edit unification for the four remaining documents
(with their `PATCH` routes), and make the Module switchboxes on `/setup` reachable
from Settings *and* actually hide the navigation entry.

## The sidebar bug was a wrong table, not a missing one

`use-modules.ts` already filtered the rail — and got the mapping wrong in two places:

| nav key | was | is | why |
| --- | --- | --- | --- |
| `customer-invoices` | `SALES` | `FINANCE` | `customer-invoice.controller.ts` carries `@RequiresModule('FINANCE')` |
| `credit-notes` | `SALES` | `FINANCE` | `credit-note.controller.ts` likewise |
| `items`, `parties` | `INVENTORY` | *no module* | their controllers deliberately carry none |

So switching FINANCE off left the invoice links in place, and switching INVENTORY off
removed the catalog while the catalog kept answering. The Item and Party controllers
explain why they are ungated: every capability prices from the same Items, and a
purchasing-only Business must still record what it buys.

The document entries are now read from `MODULE_BY_DOCUMENT_TYPE`, the contract the API
itself uses, and `use-modules.test.ts` reads the **controller sources** to check every
other entry. A controller that changes its module, or a contract that moves a Document
type, fails that file rather than silently mis-hiding a link. Reverting
`customer-invoices` to `SALES_ORDER` fails three assertions (verified).

Two more fixes in the same area:

- **The mobile drawer ignored module state entirely.** It called `navItemsFor` without
  the filter, so a phone showed every entry the rail hid. It now filters the same way.
- **A switch did not reach a mounted nav.** The rail had already fetched; toggling on
  the Settings screen left the link on screen until a full reload. `useModuleStates`
  now listens for a `MODULES_CHANGED_EVENT` that the toggle dispatches, so both the
  rail and the drawer re-read immediately.

The Settings screen already had the switchboxes and the `PUT /settings/modules/:module`
route — but **nothing linked to it**.

## The screen existed and could not be reached

Seven settings screens have their own routes: Units, Tax Rates, Number Patterns,
Modules, Terminology, Users and Roles. The rail linked to `/settings` alone, and that
page showed Appearance, Language and Business. Every one of those seven was reachable
only by typing its URL — which is what "there is no Modules selection in the settings
screen" meant, and it was true of six others besides.

`settings-nav.tsx` is the hub: a list built from the routes the app actually has, each
entry carrying the permission its own API route requires. `settings-nav.test.tsx` reads
`settings.controller.ts` and fails on any disagreement, because the first draft of that
list guessed `business-settings:read` for every entry and was wrong three times over —
Tax Rates answer on `tax-rate:manage`, Number Patterns on `number-series:manage`, and
Terminology on `terminology:manage`. A wrong guess there is a link that answers 403.
Reverting one entry fails three assertions (verified).

## Three `PATCH` routes, and one that must not exist

| document | route | draft? |
| --- | --- | --- |
| Customer Invoice | `PATCH /sales/invoices/:id` | yes — draft only |
| Credit Note | `PATCH /credit-notes/:id` | yes — draft only |
| Delivery Note | `PATCH /sales/delivery-notes/:id` | yes — draft only |
| Goods Receipt | **none, by design** | it has no draft |

A **Goods Receipt is issued at creation**: `createDraft` allocates a number and appends
the ledger entries in the same transaction, and the controller exposes no issue route
because there is nothing left to issue. An update route would have to rewrite stock
movements that already happened, so the correction for a wrong receipt is a reversal on
the ledger. `goodsReceiptUpdateSchema` was written and then deleted, and
`goods-receipt:update` was removed from the permission catalog, so the surface does not
promise an endpoint that should not exist. `goods-receipt:issue` went with it — no route
ever used it.

Each update follows the order pattern: refuse anything but a Draft with a `CONFLICT`
naming the status, replace the line set rather than merging it, and re-price from the
Items so an edit cannot introduce a line a create would have refused. The database
triggers are the last line of defence — they refuse to rewrite an Issued document or its
lines, so the service check is the readable half of a rule that holds regardless.

`creditNoteUpdateSchema` has no `invoiceId`: which Invoice a correction belongs to is
the document's identity, and re-pointing it would leave the stored figures quoting one
invoice while the row named another.

### A bug my own test found

Editing a Draft Credit Note to a *larger* reversal was refused with
"already corrected 1.000" — by the note's own stored lines. `creditedByLine` counted
every Credit Note including the one being edited, so an edit could only ever shrink. It
now takes an `exceptDocumentId`, passed on the update path; other drafts still count,
which is what keeps two drafts correcting the same remainder from both issuing.

## The three unified screens

`customer-invoice-unified.tsx`, `credit-note-unified.tsx`, `delivery-note-unified.tsx`,
each with a `[id]/edit` page, Save + Issue, and a refusal for a non-draft. The old
`*Form` files are deleted and their tests ported.

Two fields are **shown and not choosable** on an edit, because they are identity rather
than content: the Invoice a Credit Note corrects, and the Sales Order a Delivery Note
fulfils. Both would otherwise let a patch leave the lines pointing at one document while
the row named another.

`credit-note-unified` derives its "loading the lines" state from `detail?.id ===
invoiceId` rather than setting it inside the effect. That is the same
`react-hooks/set-state-in-effect` class of bug as last session — a synchronous `setState`
in an effect body — and deriving it also means a stale response for a previously picked
Invoice can never be displayed.

## Gates

| Command | Result |
| --- | --- |
| `pnpm verify --force` | 16/16, exit 0, lint **0 errors** |
| `pnpm test:integration` | 12 files, **155 passed** (was 138) |
| web unit | 32 files, **200 passed** (was 187) |
| api unit | 191 passed |
| `pnpm --filter @easyerp/web test:e2e` | 13 passed |
| mutation checks | module mapping (3 assertions), the settings-hub permissions (3), and the credit-note overdraw |

One flake was found and fixed while running the suite repeatedly: a
`document-list.test.tsx` case waited for row text but asserted on buttons that arrive
with the asynchronously-loaded session. Five consecutive clean runs after.

The database was reset again (`pnpm db:reset` + `db:up`) because the e2e suite needs a
database with no Business in it.

## Still open

1. `apps/web/e2e/global-setup.ts` still seeds `PCS` with `allowsFraction: true`, which
   contradicts the rule `/setup` now defaults to (`PIECE`, no fractions). A fixture, left
   alone rather than changed under a suite that may rely on fractional pieces.
2. Pagination and glyph shaping have no automated gate.
3. `Settings → Modules` and `/setup` can now both switch Modules, and only Settings
   re-reads the nav live; `/setup` runs before there is a nav to update, so that is
   correct — but the two screens still word the list differently.
4. The hub lists the seven screens; the rail still has a single `Settings` entry rather
   than a nested section. A sub-menu would shorten the path, and is a layout decision
   rather than a missing link.
