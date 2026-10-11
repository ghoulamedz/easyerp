# Purchasing and Production

Spec 001. Version 1, 2026-10-06.

## Problem Statement

Two Document types were already in `DOCUMENT_TYPES`, already had permissions
granted for them in `PERMISSION_CATALOG`, and were already named in `CONTEXT.md`,
while the code that would make them mean anything did not exist. Spec 001 listed
them as out of scope. They are no longer.

The first client buys goods and does not manufacture. That made Purchasing and
Production defensible exclusions when the spec was written; it is no longer the
decision. The vocabulary anticipates both, and a Document type in the contract
that no service can issue is a promise the repository is not keeping.

This spec does not restate spec 001. It covers the two Document types and
everything that exists only because of them: the Discrepancy record, the Bill of
Materials and its versions, and the two ledger reasons that production adds.

## User Stories

### Purchasing

77. As a purchaser, I want to record a Purchase Order for a Supplier with lines
    and quantities, so that what was ordered is on a record rather than in an
    email.
78. As a purchaser, I want a Purchase Order priced from the Item's purchase price,
    so that the order says what the Supplier charges and a client cannot supply
    the figure.
79. As a purchaser, I want a Purchase Order to carry an optional Supplier link,
    so that a draft can be started before the counterparty is recorded.
80. As a purchaser, I want a Purchase Order to be Draft then Issued with its own
    series, so that the ordering is traceable exactly as sales ordering is.
81. As a purchaser, I want a Goods Receipt to record what actually arrived, so
    that the stock reflects goods, not paperwork.
82. As a purchaser, I want a Goods Receipt's link to its Purchase Order to be
    optional and advisory, so that goods can be received without an order the
    same way an invoice can be raised without one.
83. As a warehouse hand, I want receiving to append `GOODS_RECEIPT` entries to the
    Stock Ledger inside one transaction under a row lock, so that two receipts of
    the same Item cannot both read the balance before either writes.
84. As an accountant, I want the difference between the quantity ordered and the
    quantity received kept as its own Discrepancy record, so that the document and
    the stock never disagree about what happened.

### Production

85. As a manufacturer, I want to record a Bill of Materials naming the component
    Items and their quantities for one unit of a finished Item, so that the recipe
    is data and not a document filed somewhere.
86. As a manufacturer, I want a Bill of Materials to be versioned, immutable and
    dated, so that a component change is a new version rather than a rewriting of
    an order already issued.
87. As a manufacturer, I want a Production Order to consume a named BOM version
    rather than "the current one", so that an order issued last month still
    produces what it said it would produce.
88. As a manufacturer, I want a Production Order to snapshot its component
    requirements when it is issued, so that a reader of the document does not have
    to go and re-derive them from a version that may since have been superseded.
89. As a manufacturer, I want issuing a Production Order to consume the components
    and produce the finished Item in one transaction under row locks, so that
    production either happens or does not, never half.
90. As a manufacturer, I want production to respect the same backorder policy as
    delivery, so that one Setting governs whether the Business is allowed to
    promise or produce what it does not have.
91. As an auditor, I want cancelling an Issued Production Order to append
    `REVERSAL` entries rather than edit the original ones, so that the ledger
    records what was done to correct it.
92. As a manager, I want the Production Module to be switchable off, so that a
    Business which does not manufacture does not see it and its endpoints refuse.

## Implementation Decisions

**One `document`, per ADR 0014.** Purchase Order and Goods Receipt are rows in
the shared table with a `type`, sharing the numbering, immutability and rendering
machinery. The Sales Order and Production Order relationships live in one-to-one
child tables of depth exactly one. Nothing about ADR 0006 changes: a number is
allocated at issue, in the transaction, from the type's own series.

**Prices are resolved server-side, as everywhere (ADR 0005).** A Purchase Order
line carries an Item and a quantity. The unit price is read from the Item's
purchase price at draft-pricing time and re-read at issue, exactly as a Customer
Invoice re-reads its sale price. A client cannot post a price.

**A Goods Receipt moves stock; a Purchase Order does not.** Ordering is a
statement of intent and touches nothing in the ledger. Receiving is the act.

**Discrepancy is a table, not a column.** `CONTEXT.md` says it is kept as its own
record "so the document and the stock never disagree", which is the same reasoning
as ADR 0004: a fact about two parties does not belong to either of them. It is
keyed by document type and id, and one row per line records expected quantity,
actual quantity, and the direction of the difference.

**A Bill of Materials is `bom` → `bom_version` → `bom_version_line`.** A version
is immutable and dated; a Production Order holds a `bomVersionId` and never joins
to "the latest". Creating a version does not touch any open Production Order,
because no open Production Order reads anything but the version it was issued
against.

**Issuing a Production Order does everything, once.** Components leave with
`PRODUCTION_OUT` under row locks, the finished Item arrives with `PRODUCTION_IN`,
the component requirements are materialised onto the document, and the backorder
policy is checked — one `INTERACTIVE TRANSACTION`, the same shape as delivery
(ADR 0004). There is no partial-production state: `STOCK_LEDGER_REASONS` has no
`PRODUCTION_PARTIAL`, and inventing a ledger reason to support a state machine the
glossary does not describe is how the glossary stops being the source of truth.
A Business that needs to record part-finished work records an adjustment with a
written reason, which is what adjustments are for.

**BOM gets its own permission group.** `bom: ['bom:read', 'bom:create']`, added to
`PERMISSION_CATALOG` alongside the existing `production` group rather than folded
into it: a Production Order is a Document with the full transition permission set,
a Bill of Materials is reference data with none of that, and one group would have
made `production-order:issue` mean two things. The existing `production` group
keeps its five `production-order:*` entries unchanged.

**Goldens follow the rule in spec 001.** Purchase Order, Goods Receipt and
Production Order are non-fiscal, so each gets `fr`/`en`/`ar` × `STANDARD` — three
documents each, nine in total. Neither axis changes their layout differently from
the types already covered.

## Testing Decisions

The seam is the one spec 001 chose and named: **HTTP against real PostgreSQL with
migrations applied**, with the real application module started. Nothing here
re-opens that question.

Coverage this spec adds:

- **Purchasing:** a client cannot supply a unit price; a Purchase Order issues into
  its own unbroken series independent of invoice numbering; a Goods Receipt appends
  ledger entries under a row lock; two concurrent receipts of the last unit produce
  one success and one refusal; a Discrepancy is written when expected and actual
  differ and is not written when they agree; a Goods Receipt without a Purchase
  Order is accepted.
- **Production:** a BOM version cannot be edited after creation; an issued
  Production Order reads its own snapshot and not a later version; issuing consumes
  components and produces the finished Item in a single transaction; a failure part
  way through leaves neither the consumption nor the production; the backorder
  policy refuses a Production Order the Business cannot stock; cancellation appends
  `REVERSAL` entries in the direction opposite to the entries it reverses.
- **Permissions:** `bom:read` and `bom:create` gate the endpoints; a disabled
  Production Module refuses `production-order:*` and `bom:*` server-side.
- **Golden:** nine new documents, three per type, per the matrix rule above.

Every test must be able to fail. A test that asserts a transaction rolled back
only by checking that no error was thrown asserts nothing.

## Out of Scope

- **Partial production.** Issuing is atomic. No `PRODUCTION_PARTIAL` reason exists.
- **Multi-level Bills of Materials.** A BOM names Items as components; a component
  that is itself manufactured is bought or produced separately. The data model does
  not forbid nesting later.
- **Work-in-progress costing, routings and workstation capacity.** A Production
  Order records what goes in and what comes out, not how long a machine took.
- **Purchase returns and supplier credit notes.** The Document type is
  `CREDIT_NOTE` with a Customer-oriented meaning today; returning goods to a
  Supplier is a stock act (`RETURN_OUT`) until a Supplier credit note has its own
  vocabulary decided with an accountant.
- **Purchase invoice matching and three-way match.** easyERP records Purchase
  Orders and Goods Receipts. It does not yet receive a Supplier's invoice against
  them, and inventing an automatic match without knowing how this Business is
  invoiced would be speculation with money.
- **Everything spec 001 still excludes.** E-invoicing transmission, Custom Field
  definition UI, multi-warehouse, lots and serial numbers, mobile and offline,
  more than three locales, file-based configuration.
