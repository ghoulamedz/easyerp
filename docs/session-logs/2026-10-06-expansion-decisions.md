# Expansion decisions — the rest of the product

Decisions taken by grilling on 2026-10-06, before any code was written for them.
The reasoning lives in `docs/adr/`; this file is the index, plus the facts that
forced each question.

## Settled

| #   | Decision                                                                                                                       | Where it lands             |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| Q1  | First-run Setup and Settings are in scope. The product is unusable without them and both were already specified.               | ADR 0012 becomes real code |
| Q2  | One generic `document` / `document_line` / `document_tax_group`, discriminated by `type`. `customer_invoice` migrates into it. | ADR 0014                   |
| Q3  | Delivery Note is in scope, with Reservations converted into Stock Ledger Entries.                                              | ADR 0004 becomes real code |
| Q4  | Documents print a server-rendered archived PDF. Payment and Stock do not: neither is a Document. Stock history exports CSV.    | ADR 0010                   |
| —   | `businessId` stays on the request body, against ADR 0003's advice. Considered and accepted.                                    | Deliberate deviation       |

## Why each was asked

- **Q1** Item CRUD needs a `taxRateId` and a `baseUnitId`; no endpoint created
  either. Every screen needs a signed-in session; no endpoint created a User or a
  Business. The integration tests seed those rows directly through Prisma, which
  is why they passed while the product was unreachable by any person.
- **Q2** `DOCUMENT_TRANSITIONS`, `isEditable`, `isNumbered` and `isFiscal` already
  promise one shared state machine. Three document types is where per-type
  duplication stops paying — and the immutability trigger protecting
  `customer_invoice_line` was _missed_ on the first attempt because the guard was
  hand-written per table.
- **Q3** `Reserved` never clears without a Delivery Note, so `Available` would
  decrease forever.
- **Q4** A PDF of live derived data is not an archive, and neither Payment nor
  Stock is a Document in `CONTEXT.md`.

### Round 2

| #   | Decision                                                                                                                                                                                                                                                                                                      | Note                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Q5  | **All seven** Document types, including Purchase Order, Goods Receipt and Production Order                                                                                                                                                                                                                    | Production Order drags the Bill of Materials in with it                                  |
| Q6  | Credit Note is **line-level and capped** at the invoice's un-credited remainder, re-priced from the _invoice's stored_ figures — never today's Item price                                                                                                                                                     | Confirmed against Tunisian practice, see below                                           |
| Q7  | Sales Order link is **optional and advisory**. An invoice may stand alone; the link never gates over-invoicing                                                                                                                                                                                                | CONTEXT says _origin_, not _exclusive_                                                   |
| Q8  | Payments are **immutable** (keep the catalog as it is, no `payment:update`); an unallocated remainder is **credit** and is displayed as such; allocations target **any document** so a refund is an allocation against a Credit Note; payment methods are **stable codes** resolved to display text by locale |                                                                                          |
| Q9  | **Modules** ship as a Business Setting, refused by a **guard**, not in each service                                                                                                                                                                                                                           | Story 20: hiding a screen is never the only thing hiding the capability                  |
| Q10 | **Offset** pagination `{ items, total, page, pageSize }`, hard `pageSize` cap, **plus sorting**                                                                                                                                                                                                               | Directly answers legacy defect: controllers returned collections unpaged                 |
| Q11 | A Delivery Note draws from `On-hand` when **no Reservation exists**. Services skip stock entirely                                                                                                                                                                                                             | A Reservation stops two promises _before_ issue; the ledger is the authority at delivery |

## Tunisian credit note — researched, not assumed

Sources: `swifto.io/blog/facturation-conforme-tunisie` (2026-06-10),
`facturetunisie.pro/facturation-tunisie` (2026-09-08), BOFIP
`BOI-TVA-DECLA-30-20-20-20` and RES N°2006/12, `finances.gov.tn`.

- _"Une facture annulée ne se supprime pas : on émet un avoir"_ — confirms ADR
  0006 independently of our own reading.
- An avoir **annule ou réduit** a facture, for _retour de marchandise, erreur de
  prix, remise consentie après coup_ — three distinct causes, so a Credit Note
  needs a reason, and partial credit is the normal case.
- It must **reference the original invoice explicitly, by number and by date**,
  and carry **all** the standard mentions. Not optional, not a soft link.
- It **reprend la même ventilation de TVA par taux** — the invoice's tax-group
  machinery is reused verbatim.
- **Stamp duty on an avoir is an open question for an accountant** (_"à faire
  trancher par votre comptable"_). It will ship as a visibly-unreviewed placeholder,
  exactly like `vat.exemptMention`, because inventing the answer is worse.

## Incidental finding, not acted on

LF 2026 art. 53 extends TTN e-invoicing to all B2B services and commercial
operations between professionals from **2026-01-01**. ADR 0011 told us to verify
the transmission timetable with an accountant; that timetable has now started.
Transmission itself remains out of scope per spec 001.

### Round 3

| #   | Decision                                                                                                                                                                                                                                     | Where it lands              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Q12 | **BOM is `bom` → `bom_version` → `bom_version_line`**, versions immutable and dated; a Production Order **snapshots** its component requirements at issue; issuing consumes and produces in **one transaction**, no partial-production state | spec 002                    |
| Q13 | Goods Receipt may stand alone, link optional and advisory. Discrepancy is **a table**, not a column. A Credit Note **never** moves stock                                                                                                     | spec 002 + ADR 0017         |
| Q14 | Settings takes spec 001 stories 8–24 and 74–76 **exactly as written**, including terminology and backfill; spec 001's Out of Scope amended in the same edit that starts implementation                                                       | spec 001                    |
| Q15 | Golden matrix: full fiscal matrix on the **two fiscal** Documents only; every other type gets `fr`/`en`/`ar` × `STANDARD`                                                                                                                    | spec 001, Testing Decisions |
| Q16 | Payment delete **cascades** its Allocations in one transaction with an audit entry. Customer balance is **four numbers**, never one: `invoiced`, `credited`, `paid`, `unallocatedCredit`, `outstanding`                                      | ADR 0016 + CONTEXT.md       |
| Q17 | `OPENING_BALANCE` refused once an Item has any other entry. A Reversal carries `reversesEntryId` and takes the **opposite** direction                                                                                                        | CONTEXT.md                  |
| —   | New permission group **`bom: ['bom:read', 'bom:create']`**; `customer-invoice:delete` and `credit-note:delete` mean **Draft only**, enforced by the transition guard; existing guard design followed unchanged                               | spec 002 + ADR 0016         |

### Round 4 — the last one

| #   | Decision                                                                                                                                                                                                                                                                             | Where it lands |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| Q18 | One typed `src/lib/api.ts` + a `useApi` hook, **client components**, no new dependency. URL search params carry page, sort and filters                                                                                                                                               | ADR 0015       |
| Q19 | Session gate in **`(app)/layout.tsx`** — "is anyone signed in" only; "is this account still live" stays `SessionGuard`'s job on every request                                                                                                                                        | ADR 0015       |
| Q20 | `DataTable`, `Paginator`, form primitives, and `Money`/`Quantity`/`DateFormat` display components that take the locale — **no screen formats a number itself**. Message files split per locale and typed `Record<MessageKey, string>` so a missing Arabic key is a **compile error** | ADR 0015       |
| Q21 | Five documents written before any code; then eleven slices in dependency order; **`AuditService.record` lands per slice**, not at the end                                                                                                                                            | this file      |

### Smaller calls taken without asking

- CSV export is **API-streamed**, `GET /api/inventory/stock.csv`, gated by
  `stock:read`, UTF-8 **with BOM** and `;` delimiter so Excel opens it correctly in
  all three locales. Not a client-side build.
- URL shape is `/${locale}/sales/invoices/:id`, matching `/dashboard` and
  `/settings`.
- Deleting a Draft Document is `DELETE`, refused by the same guard that computes
  `allowedTransitions` — so the permission string can never become a bypass of
  ADR 0006.

## Three gaps found by reading `permissions.ts`

Worth recording because none of them was a bug, just silence:

1. **No BOM permission group.** `production` holds only `production-order:*`, so a
   Document type in scope had no authority over the data it consumes. Fixed by
   Q13's new `bom` group.
2. **`delivery-note` and `goods-receipt` have no `update`/`cancel`** while
   `sales-order`, `customer-invoice` and `credit-note` do. The catalog already
   encodes "one-shot documents cannot be edited" without ever saying so. Left as
   found.
3. **`customer-invoice:delete` and `credit-note:delete` exist** alongside ADR
   0006's never-delete rule. Resolved by Q13: drafts only, enforced where the
   transitions are computed.

## Artifacts written this session

- `docs/adr/0014-all-document-types-share-one-table.md`
- `docs/adr/0015-web-reads-through-one-client.md`
- `docs/adr/0016-documents-are-cancelled-payments-are-deleted.md`
- `docs/adr/0017-a-credit-note-never-moves-stock.md`
- `docs/specs/002-purchasing-and-production.md` (stories 77–92)
- `docs/specs/001-first-business-and-core-slice.md` — Out of Scope amended, golden
  matrix rule added to Testing Decisions
- `CONTEXT.md` — `Payment` and `Allocation` now cover any Document;
  **Unallocated credit** and **Outstanding** added; **Reversal** added;
  **Opening balance** sharpened to record the refusal rule
- this file

## Open frontier

**Empty.** Every question asked had its prerequisites settled and was answered.
Next step is implementation, starting with slice 1 (Setup, spec 001 stories 1–7).
