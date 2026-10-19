# easyERP — Business Flow & Architecture Overview

For a non-accountant owner: how work flows through the app, and why it is shaped that way.
Vocabulary below follows `CONTEXT.md` verbatim (Business, Party, Item, Document, Issued…).

## 1. Architecture: what the pieces are

easyERP is a **pnpm/Turborepo monorepo** with three parts:

| Part | Location | Role |
|---|---|---|
| **NestJS API** | `apps/api/src` | All business logic: pricing, numbering, stock, permissions. Port 3002, everything under `/api`. Compiled by `tsc` (never esbuild — decorator metadata). |
| **Next.js web app** | `apps/web/src` | Screens only. It never decides anything; every action is re-checked server-side. Port 3003, proxies `/api/*` to the API. |
| **Contracts** | `packages/contracts/src` | Shared Zod schemas: `documents.ts`, `catalog.ts`, `stock.ts`, `payments.ts`, `settings.ts`, `setup.ts`, `permissions.ts`. Single source of truth for API + web; source for the OpenAPI document. |

Domain code lives in `apps/api/src/<domain>/`:

- `sales` (orders, delivery notes, invoices, credit notes), `purchasing` (purchase orders, goods receipts)
- `production` (BOMs, production orders), `inventory` (stock ledger), `finance` (pricing, invoice PDFs)
- `catalog` (Items), `parties`, `identity` (users/roles), `settings`, `setup`, `numbering`, `payments`, `audit`

Since ADR 0014, **all document types share one `document` table** (plus `document_line`,
`document_tax_group`), discriminated by a `type` column. Type-specific links live in small
child tables (delivery note → sales order; credit note → corrected invoice). Result: one
state machine (`DOCUMENT_TRANSITIONS`), one pricing path (`sales/price-document.ts`),
one immutability trigger set — instead of seven re-implementations that can drift.

One deployment = one Business = one database (ADRs 0001/0003).
There is deliberately **no `tenant_id` column**. Two databases share one Postgres container:
`easyerp` (your real rows) and `easyerp_test` (emptied between integration tests).

## 2. The business flow, end to end

Follow a concrete example: you sell 20 bags of semolina to Customer "Ben Ammar Stores".

### Step 0 — Master data: Items and Parties

Before any document, you register **Items** (`catalog/item.service.ts`):
code, name, Item type (`RAW_MATERIAL`, `SEMI_FINISHED`, `FINISHED_GOOD`, `SERVICE`,
`CONSUMABLE`), base/purchase/sale units, tax rate, sale and purchase prices,
optional reorder point. **Adding an article** = creating an Item; it carries no stock
balance (on-hand is derived from the ledger) and no per-client fields (those live in
Custom Fields). An Item typed `SERVICE` never touches stock — it is simply never
reserved and never written to the ledger.

You register **Parties** (`parties/party.service.ts`): a Party holds one or both
commercial roles — Customer, Supplier, or both in a single record. Customer-only data
(payment term days, credit limit, delivery address) appears only when the Party holds
the CUSTOMER role.

### Step 1 — The Sales Order: the promise (required origin)

The **Sales Order** is the commercial promise and the origin of delivery notes and
invoices (`sales/sales-order.service.ts`). You draft it with Customer + Items +
quantities — **never prices**: `orderLineInputSchema` is strict, so a request carrying
`unitPrice` is rejected outright (ADR 0005). While **Draft** (no number) it is fully
editable and deletable.

**Issuing** the order does four things in one transaction: re-prices every line from
current Item data, assigns the number from the gapless series, marks it immutable, and
creates **Reservations** — quantities promised to this order. The screen's "can we sell
it?" figure is `Available = on-hand − reserved`. Under the `STRICT` backorder policy,
issuing more than Available fails (409); under `ALLOW` it passes as a backorder
(a Business Setting, `settings.ts`). Service lines are never reserved.
Cancelling an issued order releases its open reservations in the same transaction —
a cancelled order is signed history, not editable.

### Step 2 — The Delivery Note: the truck leaving (optional but normal)

The **Delivery Note** records goods leaving (`sales/delivery-note.service.ts`).
It *may* reference an issued Sales Order — each line then releases that line's
reservation and grows its `deliveredQuantity` — but **standalone notes are allowed**:
the link is advisory, not structural. Issuing appends `DELIVERY_NOTE` OUT entries to
the **Stock Ledger** under Item row locks, so two shippers issuing at once cannot take
the same bag. Delivery Notes are numbered and immutable but **not fiscal**: no PDF
archive, no tax breakdown.

### Step 3 — The Customer Invoice: the bill (required to get paid)

The **Customer Invoice** is what the Customer owes you (`sales/customer-invoice.service.ts`).
It is drafted standalone from Items + quantities (it does not mechanically "convert"
an order or a delivery note), re-priced at issue from current Item data, numbered,
and **archived as a PDF with a SHA-256 hash** (`sales/document-archive.ts`).
It carries locale (`fr`/`en`/`ar`), VAT regime, currency, per-rate tax groups, and
e-invoicing fields (matricule fiscal, timbre fiscal kept *out* of the VAT base,
retenue à la source). Only the invoice asks for money — orders and delivery notes
never do. Over-crediting and post-issue edits are refused at the domain layer.

### Step 4 — The Credit Note: the only way to fix a bill

An issued invoice can never be edited or deleted. The **Credit Note** is the sole legal
correction (`sales/credit-note.service.ts`): you name the issued invoice and how much
of each invoice line to reverse. Prices come from the **invoice's stored figures**,
not current Item prices — a price changed after billing must not alter the correction.
It gets its own series (`AV-…`), its own PDF archive, and lowers Outstanding.
**A credit note never moves stock** (ADR 0017): a price error and a physical return
are different facts. Goods actually coming back are recorded as a separate `RETURN_IN`
ledger entry naming the credit note. Three uses, one mechanism: returned goods,
price error, after-the-fact discount.

### Step 5 — Payments: recording money in

easyERP **records payments; it does not process them** (no bank integration).
You record a receipt and **Allocate** parts of it: to invoices (settles debt) or to
credit notes (records a refund paid back out) (`payments/payments.service.ts`).
The remainder is **unallocated credit**; the Customer's **Outstanding**
(invoiced − credited − paid + refunded) is always derived, never stored.
A receipt keyed to the wrong Customer is **deleted with its allocations** in one
transaction — the only destructive write in the product (ADR 0016).
Document `delete` permissions mean **Draft only**; issued documents have no delete route.

### The other half: purchasing and production

**Purchasing** (`purchasing/`) mirrors sales: issue a **Purchase Order** to a Supplier;
when goods arrive, a **Goods Receipt** appends `GOODS_RECEIPT` IN entries. Ordered 100,
received 96? The 4-unit gap is kept as its own **Discrepancy** record so document and
stock never disagree.

**Production** (`production/`): a **Bill of Materials** is the recipe for one unit of a
finished Item; every change creates an immutable, dated **BOM version**, and a
**Production Order** always consumes a *named version*, never "the current one".
Issuing consumes components (`PRODUCTION_OUT`) and produces finished goods
(`PRODUCTION_IN`) in one transaction (`production-order.service.ts`).

## 3. Design decisions that shape daily use

- **Draft vs Issued is the whole product** (ADR 0006). Drafts: no number, editable,
  deletable. Issued: numbered at issue from a gapless per-type-per-year series
  (atomic `UPDATE … RETURNING`), immutable via DB triggers on document *and* lines
  *and* tax groups, never deleted. Orders/production can also be **Cancelled**
  (promise withdrawn, reservations released); fiscal documents cannot — only a new
  Credit Note corrects them.
- **Stock is an append-only ledger** (ADR 0004). No balance column; on-hand derived,
  `Available = on-hand − reserved`. One interactive transaction under a row lock per
  mutation; corrections are **Reversal** entries pointing at the original, never edits.
  Opening balance allowed exactly once per Item; afterwards, adjustments with a reason.
- **The server prices everything** (ADR 0005). Money is `numeric(18,3)`, zero float
  arithmetic, rounded once at the edge (HALF_UP). Tax rates have effective dates —
  never literals in code.
- **Permissions are the only authorization** (`permissions.ts`, `resource:action`,
  checked on every request; no wildcards). Roles bundle them; the **Administrator**
  role always exists and cannot be removed or stripped. The interface grants nothing.
- **Modules are on/off switches** (`settings/module-state.service.ts`, `ModulesGuard`):
  SALES, PURCHASING, INVENTORY, FINANCE, PRODUCTION. Off = absent from navigation and
  every endpoint refused — but already-recorded data is never hidden.
- **First-run Setup happens once** (ADR 0012): while no Business exists, a
  token-gated (`FIRST_SETUP_TOKEN`), unauthenticated call creates Business + first
  Administrator + number patterns + units + tax rates in one transaction (advisory
  lock, constant-time token compare), then closes forever — the guard is a row count,
  so restoring a backup re-closes it. New required settings later arrive via backfill
  with safe defaults, never by re-running Setup.
- **Invoices are tax-authority documents.** The model already carries TEIF e-invoicing
  fields; transmission is a replaceable adapter (currently no-op), and a document can
  be `ISSUED · TRANSMISSION_FAILED` and retried — never renumbered (ADR 0011).
  A paper is rendered server-side from the stored row — `GET <paper>/:id/print`,
  `fr`/`en`/`ar` × STANDARD/EXEMPT/mixed — and printed by the visitor's browser. The
  **row is the record**: nothing is archived, so nothing is lost and nothing can
  disagree with the database. Keeping the paper is the owner's printing job, and the
  database backup keeps the figures.

## Start here (for the next agent)

1. `CONTEXT.md` — vocabulary. 2. `packages/contracts/src/documents.ts` — state machine
   + every document shape. 3. `apps/api/src/sales/sales-order.service.ts` → 
   `delivery-note.service.ts` → `customer-invoice.service.ts` → `credit-note.service.ts`.
4. ADRs 0004 (ledger), 0005 (server prices), 0006 (number at issue), 0012 (setup),
   0014 (one table), 0016 (cancel vs delete), 0017 (credit note ≠ stock).
