# Spec 001 — First Business, and the core sales, stock and invoicing slice

Status: draft for review
Covers: ADR 0012 (first-run setup), ADR 0004 (stock is a ledger), ADR 0005 (server prices documents), ADR 0006 (number at issue, issued is immutable), ADR 0007 (Better Auth), ADR 0008 (custom fields are data), ADR 0009 (three locales with RTL), ADR 0010 (server-rendered documents), ADR 0011 (TEIF-ready invoice model)

## Problem Statement

easyERP is a multi-language ERP sold to independent Businesses, each on its own deployment (ADR 0001). Today a deployment cannot be used at all: there is no Business, no User, no sign-in, and no route beyond a health check. An operator cannot hand a client a URL, and no client can be shown the product. Everything downstream — Items, Parties, Sales Orders, Delivery Notes, Stock Ledger Entries, Customer Invoices — is blocked behind the absence of a Business to own them.

The legacy application being replaced cannot be the fallback. Its audit found authorization inoperative across all of its protected endpoints, deactivated accounts still able to sign in, forgeable delivery and receipt notes, prices and VAT accepted from the browser, concurrent overselling, numbering that cannot be relied on, and no invoicing, payment recording or change tracking at all.

At the same time, the product's commercial promise is that a new client is onboarded by configuring, not by forking: one codebase, a new brand, the Business's own products and terminology, its own tax rates and legal particulars, and no code change. That promise is currently unproven, because nothing has ever been provisioned.

## Solution

A first visit to a fresh deployment leads a one-time Setup screen. Presenting a token, the operator or the client creates the Business, its first Administrator, the Settings without which nothing can be issued, and the terminology the Business reads natively. That work is written to the database once and never repeated: Setup closes permanently, and every later release reaches an existing Business through a versioned Backfill that supplies a default rather than asking a question.

From there, the product delivers the slice that proves the four invariants the legacy application broke. Items and Parties are recorded. A Sales Order is created as a Draft, priced entirely by the server, and issued into an immutable numbered Document. Issuing creates Reservations. A Delivery Note converts those Reservations into Stock Ledger Entries, from which On-hand, Reserved and Available are derived and never stored. A Customer Invoice is issued from a Sales Order with a per-rate VAT breakdown, is immutable, and is corrected only by Credit Note. Payments and Allocations follow.

Throughout, the interface is in French, English or Arabic with correct right-to-left layout, every archived Document is rendered and kept by the server, every action lands in an Audit trail, and Permissions are the only thing that authorizes anything.

## User Stories

### Operator, provisioning a deployment

1. As an operator, I want a fresh deployment to tell me it needs Setup, so that I never hand a client a URL that silently fails.
2. As an operator, I want Setup to refuse to open once a Business exists, so that I cannot re-provision a live client by accident.
3. As an operator, I want to present a single-use token from the host's own environment, so that whoever finds a client's URL first cannot become that client's Administrator.
4. As an operator, I want Setup to record its own completion with no actor, so that the audit trail shows the one event that legitimately has none.
5. As an operator, I want two simultaneous Setup submissions to produce exactly one Business, so that a double-clicked button cannot create two.
6. As an operator, I want a restored backup to leave Setup closed without any manual step, so that restoring an older backup is safe.
7. As an operator, I want a deployment to never reopen Setup, so that an unattended rollout across every client cannot re-expose an unauthenticated write.

### Administrator, configuring the Business

8. As an Administrator, I want to record the Business's legal name, trading name, tax identifier and address, so that invoices carry the particulars the tax authority requires.
9. As an Administrator, I want to set the VAT regime to STANDARD or EXEMPT, so that documents either print a breakdown or print a legal mention instead.
10. As an Administrator, I want to maintain Tax Rates with effective dates, so that a rate change applies from a date rather than rewriting history.
11. As an Administrator, I want to retire a Tax Rate without deleting it, so that invoices already issued under it still render.
12. As an Administrator, I want to refuse deleting a Tax Rate that an issued Document references, so that a fiscal document can never lose its rate.
13. As an Administrator, I want to define Units of measure and say whether each allows fractions, so that I cannot enter 2.5 pieces if pieces are whole.
14. As an Administrator, I want to configure the number pattern for each Document type, so that a Business's numbers match its existing paper trail.
15. As an Administrator, I want zero-padded numbers, so that CC-2026-0007 sorts and reads the way my accountant expects.
16. As an Administrator, I want to rename displayed concepts into my own vocabulary, so that my staff read "Product" rather than "Item".
17. As an Administrator, I want those renames to exist in each of my three languages independently, so that an Arabic instance is not a French instance with translated chrome.
18. As an Administrator, I want the underlying concepts to stay fixed in code, so that a rename never changes what the system does.
19. As an Administrator, I want to switch a Module off, so that a Business which does not manufacture does not see Production in its navigation.
20. As an Administrator, I want a disabled Module's endpoints to refuse every request, so that hiding a screen is never the only thing hiding the capability.
21. As an Administrator, I want to invite Users and assign them Roles, so that people only see the work they are meant to do.
22. As an Administrator, I want to be unable to remove the last Administrator, so that a Business can never be locked out of its own data.
23. As an Administrator, I want disabling an account to take effect on its next request, so that a departing member of staff loses access immediately.
24. As an Administrator, I want to change what is editable in a later release without losing what I configured, so that an upgrade never asks me to start again.

### Catalog and counterparties

25. As a salesperson, I want to record an Item with a code, name, type, units and prices, so that I can put it on a document.
26. As a salesperson, I want an Item's prices to live in one place, so that every document prices it identically.
27. As a salesperson, I want to retire an Item rather than delete it, so that historical documents keep their description.
28. As a salesperson, I want to record a Customer with a tax identifier, so that their invoices are valid.
29. As a salesperson, I want one Party to be both Customer and Supplier, so that I do not maintain two records for one counterparty.
30. As a salesperson, I want to hold payment terms, credit limit and delivery address against a Customer, so that documents can refer to them rather than repeat them.
31. As a salesperson, I want to be unable to save a half-typed Item, so that incomplete data never reaches a document.
32. As a salesperson, I want to search Items and Parties as I type, so that a long catalog does not slow me down.

### Sales Orders

33. As a salesperson, I want to build a Sales Order as a Draft, so that I can change it freely until it becomes a promise.
34. As a salesperson, I want a Draft to carry no number, so that abandoning it leaves no gap in the series.
35. As a salesperson, I want to delete a Draft, so that mistakes do not accumulate.
36. As a salesperson, I want the server to resolve every unit price and tax rate, so that no browser can forge an amount.
37. As a salesperson, I want a request carrying a price to be rejected outright, so that I am told rather than silently ignored.
38. As a salesperson, I want to issue a Sales Order and receive a number, so that it becomes traceable.
39. As a salesperson, I want to be told I cannot issue an order exceeding Available, so that I never promise stock I do not have.
40. As a salesperson, I want to allow issuing beyond Available deliberately for a backorder, so that a known shortage does not block a sale.
41. As a salesperson, I want issuing to create Reservations, so that the same stock cannot be promised twice.
42. As a salesperson, I want to cancel an issued order and have its Reservations released, so that the stock becomes sellable again.
43. As a salesperson, I want an issued order to be impossible to edit, so that its promise cannot change after the fact.
44. As a salesperson, I want two people issuing the last items of one Item to result in one success and one clear refusal, so that we never oversell.
45. As a salesperson, I want to see a Customer's open orders and their delivery status, so that I can answer a phone call.

### Delivery and stock

46. As a warehouse operator, I want to create a Delivery Note against an issued Sales Order, so that what left the building is recorded.
47. As a warehouse operator, I want issuing a Delivery Note to convert Reservations into Stock Ledger Entries, so that one movement is recorded once.
48. As a warehouse operator, I want a partial Delivery Note, so that I can ship what is ready.
49. As a warehouse operator, I want the Ledger Entry to record the balance before and after, so that a discrepancy is reconstructible.
50. As a warehouse operator, I want every Ledger Entry to carry a mandatory reason, so that a correction is always explained.
51. As a warehouse operator, I want to adjust stock with a written reason, so that a correction is auditable rather than silent.
52. As a warehouse operator, I want a reversal rather than an edit, so that an entry that was wrong is superseded, not rewritten.
53. As a warehouse operator, I want to open an Item's stock history in order, so that I can see how the current balance arose.
54. As a warehouse operator, I want On-hand to be derived rather than stored, so that no balance can drift from the entries behind it.
55. As a warehouse operator, I want an Opening Balance for stock predating easyERP, so that the ledger starts from reality.
56. As a warehouse operator, I want to be warned when On-hand falls to the reorder point, so that I reorder before a stockout.

### Invoicing

57. As an accountant, I want to issue a Customer Invoice from a Sales Order, so that I bill for what was delivered.
58. As an accountant, I want the invoice number to come from its own unbroken series, so that the tax authority sees no gap.
59. As an accountant, I want the invoice to print a per-rate VAT breakdown when the regime is STANDARD, so that it is legally complete.
60. As an accountant, I want an EXEMPT invoice to print a legal mention instead of a breakdown, so that it is correct for that regime.
61. As an accountant, I want stamp duty carried as its own line and never inside the VAT base, so that the VAT figure is defensible.
62. As an accountant, I want withholding tax carried as rate, base and amount, so that regimes requiring it are supported.
63. As an accountant, I want to record a Payment and allocate it across one or more invoices, whole or partial, so that an account balance reflects reality.
64. As an accountant, I want to see what a Customer owes, so that I can chase it.
65. As an accountant, I want to correct an issued invoice with a Credit Note, so that the issued document stays intact.
66. As an accountant, I want a Credit Note to have its own series, so that corrections are as traceable as invoices.
67. As an accountant, I want an issued invoice to be immutable, so that what the client received is what the record says.
68. As an accountant, I want the invoice PDF generated and kept by the server, so that the archival copy is the one the tax authority would see.
69. As an accountant, I want to download that PDF years later, so that an audit is survivable.

### Audit and correctness

70. As an auditor, I want to see who did what, to which record, with the state before and after, so that I can reconstruct any change.
71. As an auditor, I want that trail to be immutable, so that it cannot be edited to match a story.
72. As an auditor, I want issuance, cancellation, stock movement and Settings changes all recorded, so that nothing material happens silently.
73. As an auditor, I want Audit entries retained, so that the trail outlives any single person's memory.

### Release and upgrades

74. As an operator, I want a release that adds a required Setting to backfill it on existing Businesses with a safe default, so that no upgrade ever breaks a client.
75. As an operator, I want an upgrade that has not been backfilled to refuse readiness loudly, so that it is never half-configured in production.
76. As an operator, I want to roll that backfill forward on a restored older backup, so that restore works without a manual script.

## Implementation Decisions

### Modules

Seven domain areas under the API: **setup**, **settings**, **catalog**, **parties**, **sales**, **inventory**, **finance**, alongside the existing identity, audit, prisma and health areas. Grouping follows the glossary, not the legacy application's controllers.

### Setup

- One endpoint, unauthenticated, reachable only while no Business exists.
- Gated on a single-use token supplied by the host environment, read from the process environment and never stored in the database. Comparison is constant-time.
- Guard is `count(Business) = 0`, evaluated inside the same transaction that inserts the first Business, under a PostgreSQL advisory transaction lock. The lock key is fixed, not derived from input.
- Creates in one transaction: the Business, its first User as Administrator with a password the person running Setup chooses, a number pattern for every Document type, at least one Unit of measure, and at least one Tax Rate when the VAT regime is STANDARD.
- Writes one Audit Entry with a null actor. It is the only such entry.
- After completion the route returns 404 permanently. There is no administrative override and no "re-run setup"; Settings is the permanent successor.
- Requests that fail partway leave nothing behind: the whole creation is one transaction.

### Backfill and versioning

- The Business carries an integer recording which release's Settings expectations it satisfies. It is not the application version and only advances when a release adds a required Setting.
- Each such release ships a migration that writes the default into every Business below that version and advances the stored version, in one idempotent transaction. It never prompts.
- The API's compiled-in expected version is compared against the stored one at startup. A mismatch fails readiness with a reason rather than serving traffic against half-migrated Settings.
- **Release rule: a release that adds a required Setting without a default does not ship.** This is the single invariant that keeps "an upgrade never breaks a client" true.
- Setup writes the current version, so a Business provisioned today never needs a backfill.

### Settings

- Business profile, VAT regime, currency, Tax Rates, Units, number patterns and terminology are edited by an Administrator under the existing `business-settings:read`/`update`, `tax-rate:manage`, `number-series:manage` and `terminology:manage` permissions.
- Tax Rates and number patterns are deactivated, never deleted. Deleting one referenced by an issued Document is refused.
- Terminology is stored per entity, code and locale. The underlying concepts remain fixed in code; only displayed strings change. Disabling a label never destroys stored data.
- **Fixed:** the number pattern's padding is stored and documented; the renderer now takes the padding and pads, and a test asserts zero-padding.

### Catalog and Parties

- Item and Party schemas already exist in the shared contracts and are used as-is, including the Custom Field payload and the prohibition on clients sending prices.
- One Party may hold both commercial roles; no separate Customer and Supplier records.
- Items and Parties are deactivated, never deleted, so issued documents keep their descriptions.

### Documents, numbering and pricing

- Every Document type shares one status machine and the transition table already defined in the contracts. An unlisted transition is refused.
- Drafts carry no number and are deletable. Issuing assigns a number from an atomic per-type, per-year counter using `UPDATE … RETURNING` inside the issuing transaction. Gaps are structurally impossible.
- An issued Document has no update or delete endpoint in the API surface. Not "hidden" — absent.
- Pricing uses the existing `Amount` value object over decimal arithmetic. Money is `numeric(18,3)`, transported as exact decimal strings, rounded HALF_UP once at the documented edge. No floating point touches any amount.
- Order line input is strict: a request carrying a unit price is rejected, not sanitized.

### Inventory

- Stock changes only by appending a Stock Ledger Entry, inside one interactive transaction, under a row lock taken on the Item.
- On-hand, Reserved and Available are computed from the ledger and open Reservations. No balance column exists on the Item.
- Direction is derived from the mandatory reason and cannot be chosen independently.
- Entries record the balance before and after, the source Document and the acting User.
- Corrections append a reversal. No entry is ever updated or deleted.
- Issuing a Sales Order creates Reservations; cancelling it releases them, in the same transaction as the status change.
- The backorder policy is a Business Setting: STRICT refuses issuing beyond Available, ALLOW permits it.

### Finance

- Customer Invoice and Credit Note are Issued, numbered, immutable and rendered server-side to PDF, which is stored on the host's disk under the Document archive and is not part of the database backup.
- The invoice carries every field ADR 0011 lists. Transmission ships behind a port with a no-op implementation and per-Business transmission state OFF, PENDING or ON; it is out of scope to transmit.
- Stamp duty is a separate line and never inside the VAT base. Withholding tax is rate, base and amount.
- Payment records money received; Allocations assign it to Customer Invoices, whole or partial. easyERP records payments and does not process them.

### Cross-cutting

- **Modules** are a Business Setting. A disabled Module is absent from navigation, and its endpoints refuse every request server-side. Interfaces grant nothing.
- Every route states the Permissions it requires; Permissions are the only authorization.
- All three locales ship together with correct right-to-left layout from the first screen. A Cached `Label` lookup resolves displayed strings per locale.
- `AuditService.record` is called from within the caller's transaction for every material action, and is currently unused — wiring it is part of this slice, not a follow-up.
- The OpenAPI document gains real paths. Its schemas exist and currently describe routes that do not.
- **Fixed:** the schema promises a GIN index on the Custom Field payload that no migration creates. Added, with a test asserting the planner uses it.
- **Fix required:** the shared contracts already model Production Order and Purchase Order. They are not implemented in this slice; those Document types are rejected with a clear refusal when their Module is disabled.

### Explicitly rejected

- **A configuration file per client (TOML or YAML).** Rejected: it creates two sources of truth with a silent drift failure — the file says 19%, the client changed it to 20% in the product, the next deployment reverts it unnoticed. Settings live in the database and are edited by an Administrator.
- **Reopening Setup on each deployment.** Rejected: deployments run unattended across every client, and client domains are guessable, so this would re-expose an unauthenticated write to all instances at once.
- **Nullable Settings with null branches at every use.** Rejected: the type stops telling the truth and every rendering path grows an untested branch. Money and legal particulars are exactly where the database should refuse.
- **Object storage for archived PDFs.** Rejected on cost. Consequence, recorded honestly: the database backup does not include the Document archive, and ten-year retention is the Business's own download discipline.

## Testing Decisions

**A good test asserts external behaviour through the highest seam available and can fail.** A test that cannot fail is worse than no test, because it is counted as evidence. Every test below must be shown to fail when its behaviour is broken.

### Primary seam: the HTTP process boundary

The setup and domain endpoints are exercised over HTTP against a real PostgreSQL with migrations applied. This is the highest seam available and it exercises routing, the token check, the count guard, the advisory lock, Permissions, transaction boundaries, row locks and the audit write in a single pass. No service-level seam is added: the services are covered _through_ the boundary, so a unit test that restates a service's logic in a mock proves nothing about the product.

**Prior art in this repository:** the identity integration suite already drives real transactions, real `pg_advisory_xact_lock` behaviour and a two-writer concurrency case against real PostgreSQL, truncating between tests and running serially. The boot suite starts the real application module and asserts over real HTTP. Both are the model.

**The suite is the most destructive thing in the repository, so its target is checked, not trusted.** It deletes every row in every table before each test. It takes its database from a committed `.env.test` pointing at the disposable compose database, it lets an environment variable override that so CI can use its own service container, and it refuses to start against any database whose name does not identify it as disposable. A green suite must never be achievable by pointing the tests at a real Business's data.

### Coverage

- **Setup:** refuses without a valid token; accepts with one; creates exactly the mandated set of records; refuses when a Business already exists; two concurrent submissions yield one Business and one refusal; nothing is persisted when creation fails midway; the audit entry is written with a null actor; a second visit is 404.
- **Backfill:** a Business below the expected version fails readiness with a reason; after the migration runs it passes; the migration is idempotent under re-run; a Business provisioned at the current version needs no backfill.
- **Settings:** terminology overrides change displayed strings in one locale and leave others untouched; a referenced Tax Rate cannot be deleted; number patterns produce zero-padded numbers matching the stored padding.
- **Catalog and Parties:** prices cannot be supplied by a client; a Party may hold both roles; deactivation preserves historical descriptions.
- **Documents:** a Draft has no number and is deletable; issuing assigns the next number in an unbroken series; an unlisted transition is refused; there is no update or delete route for an issued Document; totals equal the sum of the priced lines.
- **Inventory:** issuing creates Reservations; delivering converts them to ledger entries and decrements Available; cancelling releases them; a partial delivery is allowed; a correction appends a reversal and never edits; an adjustment without a written reason is refused; two concurrent deliveries of the last units result in one success and one refusal.
- **Finance:** invoice numbering is unbroken and independent of Sales Order numbering; an issued invoice is immutable; a Credit Note corrects it and carries its own number; the STANDARD breakdown sums to the total; an EXEMPT invoice prints a legal mention and no breakdown; stamp duty is outside the VAT base; a Payment allocates whole and partial; over-allocation is refused.
- **Modules:** a disabled Module's navigation entry is absent and its endpoints refuse, server-side, whatever the client sends.
- **Audit:** issuance, cancellation, stock movement and Settings changes each produce an entry carrying actor, target and before/after state.

### Secondary seam: Playwright

Setup is a screen a person uses exactly once, so the screen itself is the product for that moment. The existing browser suite is extended to complete Setup end to end in a real browser and assert the resulting sign-in works. Arabic is exercised for correct right-to-left layout, following the existing right-to-left test.

### What the printed documents are tested for

The documents were compared byte for byte against committed renderings. That is
gone, and the reasoning is worth keeping because the same mistake is easy to
re-make: a golden is re-blessed from the code that produced it, so a wrong figure
re-blessed becomes the wrong baseline, while every cosmetic edit turns the gate
red. It needed a browser in the fast loop and it asserted layout — not the thing
the Business is answerable for.

What is asserted now is **the data on the paper is the data in the row**:

- `apps/api/src/finance/__tests__/invoice-print-consistency.test.ts` and
  `apps/api/src/documents/__tests__/paper-print-consistency.test.ts` read the view
  the server renders from and require its figures on the page: the number, the
  dates, the issuer's legal identity, the party, every line's quantity and figures,
  the totals to the stored three decimals, each tax rate of the breakdown with its
  base and amount, the FODEC row, the stamp-duty line, and a placeholder never.
- Both run in `pnpm verify`, with no browser and no database, in milliseconds.
- Restyling a table, moving a column or rewording a label does not fail them.
  Printing a different number, losing a tax group or rounding a total does.

`print-contract.test.ts` covers the structural half: A4 with a margin, no script
and nothing to fetch, logical properties only (the RTL regression), an
Arabic-capable font stack, `dir` from the locale. These are asserted independently
of any fixture, so no re-bless can bless them away.

**Not covered by any test:** pagination and glyph shaping. Both need a layout
engine, and there is no longer one in the toolchain. An invoice that spills onto a
third page, or Arabic that joins badly, is caught by printing one.

**The matrix and why it is 3x2-and-one.** Two axes are being counted, and conflating
them was the error in the earlier draft of this spec, which said "three VAT
regimes". They are not the same thing:

- The **VAT regime** is a fact about the Business, and there are exactly two:
  `STANDARD` prints a per-rate breakdown, `EXEMPT` prints a legal mention instead
  (CONTEXT.md, ADR 0011). It is a question of _how_ tax is presented.
- A **tax rate** is a row in `tax_rate` with effective dates (CONTEXT.md: "Never a
  literal in code"). Tunisia applies three: **19%** standard, **13%** reduced,
  **7%** reduced. Whether a given Item sits at one of them is data the Business
  enters, not something the product decides.

So the fiscal documents are exercised as `fr`/`en`/`ar` × `STANDARD`/`EXEMPT`, plus
one `STANDARD` invoice whose lines carry 19%, 13% and 7% at once — because a
breakdown that only ever renders one rate has never been tested against the case it
exists for: grouping several rates, keeping each group's base and amount intact, and
having the groups sum to the total. Every operational paper is exercised in all
three locales, since what varies per type is its header, its field set and its
series.

**Every figure above is unverified and awaits an accountant.** Tunisian VAT is
changed by each loi de finances, and the thresholds that decide whether a small
Business is subject to VAT at all were not confirmed from a primary source while
this was written. ADR 0009 is the rule that applies: no legal text reaches a document
template until a human has approved it. Until then the tests prove the _arithmetic
and the data on the page_ — that a breakdown sums to the total, that an EXEMPT
invoice carries the mention and no breakdown, that the Arabic page is marked RTL —
and not that a rate is the right rate. Two gaps found by writing them are recorded
as `it.fails` rather than fixed: the fiscal template prints no tax identifier for
either party, and a Sales Order prints no VAT row although its gross differs from
its net. Both need a human's wording (ADR 0009).

**Implemented.** The API renders every paper from the stored row, on request, as
self-contained HTML (`apps/api/src/finance/print-copy.ts`,
`apps/api/src/documents/paper-template.ts`), and `GET <paper>/:id/print` serves it
for all seven types. Nothing is filed, no renderer exists, and the browser prints.

The tax rates are rendered from data, never from literals in the template
(CONTEXT.md), and the EXEMPT mention is a visibly unapproved placeholder rather
than an invented legal sentence.

### Gates

Lint, strict typecheck, unit tests, integration tests against real PostgreSQL including the real application module actually being started, browser tests, and the tests that assert the printed documents carry the stored data. "It compiles" is not a gate, and neither is a green unit suite: every test must be able to fail.

## Out of Scope

Two entries that were here — **Production and Bill of Materials**, and
**Purchasing** — were removed on 2026-10-06. Both are now in scope and are
specified in `002-purchasing-and-production.md`. The rationale for bringing them
in, and the decisions taken while doing so, are in the session log for that date;
the `DOCUMENT_TYPES` contract already carried all seven types, so this is the
spec catching up to the vocabulary rather than the vocabulary changing.

- **Payments as a gateway.** easyERP records payments and allocations. It does not process them.
- **E-invoicing transmission.** The invoice model is TEIF-shaped per ADR 0011; the serializer, signature and transmission ship behind a port with a no-op implementation, and per-Business transmission state stays OFF.
- **Custom Field definition UI.** The data model and storage exist; the screens to define and manage them do not.
- **Multi-warehouse, lots and serial numbers.** The ledger is shaped to allow them later and does not implement them.
- **Mobile and offline.** The interface is responsive and usable on a phone; nothing is built for intermittent connectivity.
- **More than three locales.** French, English and Arabic ship together.
- **Anything requiring a second source of truth for configuration.** No file-based configuration.

## Further Notes

- The legacy audit's blocking findings map onto this slice deliberately: broken authorization is answered by Permissions on every route and the boot gate; deactivated accounts that still work is answered by re-reading the session on every request; forgeable stock notes are answered by the server resolving every quantity from the document it was issued against; prices and VAT accepted from the client is answered by strict line input; concurrent overselling is answered by the row lock and derived balances; unreliable numbering is answered by the atomic counter; no change tracking is answered by the audit trail being wired into the caller's transaction.
- `numberPattern.padding` being stored but ignored was a live defect, not a future concern. It is fixed: the renderer takes the padding and pads, and the test asserts zero-padding.
- `custom_record.values` promised a GIN index that no migration created. It exists now, and the test asserts both that it is there and that the planner reaches for it.
- The restore drill checks nine table names that do not exist and would report eight of nine missing on every run, failing permanently. It should be repaired before any client depends on it, since a backup nobody can restore is not a backup.
- The Document archive is outside the database backup. That is a deliberate cost decision, and it should be stated to each Business at onboarding rather than discovered later.
- `AuditService.record` and `RequirePermissions` are both currently unused. In this slice they stop being unused, which is the point of this slice: the infrastructure exists and the invariants it protects are finally exercised by real traffic.

## Implementation status

The Customer Invoice flow is implemented and gated:

- `Item`, `Party`, `CustomerInvoice`, `CustomerInvoiceLine`, `CustomerInvoiceTaxGroup`
  in `20261005120000_catalog_and_customer_invoice`, field names taken from
  `itemSchema`, `partySchema`, `orderLineSchema` and `documentTotalsSchema`.
- Immutability enforced by three database triggers — on the invoice, its lines and
  its tax groups. Two integration tests cover this and the numbering race; see
  `docs/session-logs/2026-10-05-customer-invoice-flow.md`.
- Endpoints: `POST /api/sales/invoices`, `POST /api/sales/invoices/:id/issue`,
  `GET /api/sales/invoices/:id`, `GET /api/sales/invoices/:id/pdf`. **No DELETE
  route exists**, for a Draft or an Issued document; `permissions.ts` contains
  `customer-invoice:delete` and the surface deliberately does not use it.

Not implemented: `Label` rows from the database (the renderer still uses unreviewed
`terminology.ts` defaults), Item and Party CRUD, draft editing and cancellation,
Sales Orders, Credit Notes, payments, stock, and any web invoicing screen.
