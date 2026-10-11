# Every Document type shares one table

All Document types live in one `document` table with one `document_line` and one
`document_tax_group` beside it, discriminated by a `type` column, rather than
getting a table each. `customer_invoice` and its two children migrate into them.

`CONTEXT.md` already promised this — "Every Document type shares the same
numbering, immutability and rendering machinery" — and the contracts already
carry the single state machine (`DOCUMENT_TRANSITIONS`, `isEditable`,
`isNumbered`, `isFiscal`, `allowedTransitions`). Per-type tables would have made
each of those a re-implementation, which is how the transition table and the
naming rules stop being one definition.

The deciding evidence is a defect already paid for. The first Customer Invoice
migration added an immutability trigger on `customer_invoice` and **forgot** the
lines, so every figure the document showed was editable after issue by a single
`UPDATE`. It was found only because a test was written for it afterwards. A guard
hand-written once per table is a guard that will be forgotten once per table;
`customer_invoice_line` was the proof, and it was not a subtle omission. With one
table there is one trigger to forget, and the test suite already knows how to look
for it.

What does **not** move into the shared table: a type-specific _child_ table for
fields only one type has — Delivery Note's link to its Sales Order, Credit Note's
link to the invoice it corrects. The shared tables hold what every Document has
(identity, status, number, party, locale, currency, totals, lines, tax groups,
archive), and a child table of depth exactly one holds the rest. Three tables plus
N optional one-to-one children is still a fixed number of places to look, where
per-type is a number that grows with the product.

Consequences:

- Pricing, issuing, cancelling, repricing-at-issue and the PDF archive become one
  service with a `type` parameter, not one service per type. The Customer Invoice
  integration suite keeps running against it.
- The immutability trigger moves to `document`, `document_line` and
  `document_tax_group`, and the same suite proves it on each of them.
- `type` is stored on the row so a reader is not left inferring it from which
  child table happens to be populated.
- Numbering was already generic (`DocumentNumberingService.allocate` takes a type
  code), so nothing about ADR 0006 changes.
- Documents that must never exist as a bare row are rejected at the domain layer by
  `DOCUMENT_TYPES`, and `PRODUCTION_ORDER` stays out until its Module is real.
