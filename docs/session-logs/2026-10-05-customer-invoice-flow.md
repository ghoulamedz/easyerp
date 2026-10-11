# Customer Invoice flow: the contracts were already written

Session that implemented the first end-to-end Customer Invoice flow, and that spent
most of its first half undoing code written before reading `packages/contracts`.

## What was done

- Schema for `Item`, `Party`, `CustomerInvoice`, `CustomerInvoiceLine` and
  `CustomerInvoiceTaxGroup`, in migration
  `20261005120000_catalog_and_customer_invoice`. Field names are the ones in
  `packages/contracts` (`itemSchema`, `partySchema`, `orderLineSchema`,
  `documentTotalsSchema`) — see "The mistake" below for why that was not the first
  attempt.
- Immutability in the database, on three tables: the invoice, its lines and its tax
  groups. A parent-only trigger would have left every figure the document shows
  editable after issue by a single `UPDATE`.
- `DocumentNumberingService`: one `INSERT … ON CONFLICT DO UPDATE … RETURNING`
  statement, run on the caller's transaction client.
- `DocumentArchive`: writes the PDF under `<root>/<code>/<year>/<number>.pdf` with
  `wx`, so a collision fails loudly instead of overwriting an issued document.
- `CustomerInvoiceService.createDraft` / `.issue` / `.readArchive` / `.findById`,
  `CustomerInvoiceController`, `SalesModule` registered in `AppModule`.
- Contract additions: `LOCALES`/`localeSchema`, `documentTaxGroupSchema`,
  `documentArchiveSchema`, `customerInvoiceSchema`, `draftCustomerInvoiceSchema`.
  `LOCALES` moved out of `apps/api/src/finance/terminology.ts`, which now re-exports
  it, because the web app renders the same documents and two locale lists drift.
- `DOCUMENT_ARCHIVE_ROOT` in `apps/api/src/config/env.ts`, refused in production if
  left at its development default.

## The mistake worth remembering

The first version of the schema used `sku`, `unitId`, `unitPrice`, `net`, `gross`,
`netTotal`, `taxTotal`, `grossTotal`. The contracts already said `code`, `baseUnitId`,
`saleUnitId`, `purchaseUnitId`, `salePrice`, `purchasePrice`, `netAmount`,
`grossAmount`. AGENTS.md is explicit that the shared types "are never re-declared".

Three separate pieces of code were written before the contracts were opened, and each
duplicated something that already existed:

1. `assertNoAmountsFromClient` — `orderLineInputSchema` is a `strictObject` and
   already rejects `unitPrice`, naming the field.
2. `InvoiceError` — `common/errors.ts` already has `DomainError` with a status per
   code, and `DomainExceptionFilter` is global in `main.ts`. A bespoke error class
   would have surfaced as a 500.
3. A hand-mapped Zod issue list — the filter already renders a `ZodError` as 422 with
   issue paths.

The service file was written three times. The first two had a dead variable, a
fabricated unit price recovered by string-splitting a rendered document number, an
`indexOf` inside a `map`, two functions both named `sum`, and `allocate()` reaching
for `this.prisma` instead of the transaction client — which alone would have broken
the gapless guarantee it was written to provide.

**Read the contracts and `common/errors.ts` before the schema and before the service.**
Both files existed, both were authoritative, and neither was opened first.

## Three bugs the tests found, not the typechecker

**`prisma migrate diff` silently dropped a raw-SQL index.** Diffing the migrations
directory against the datamodel emitted `DROP INDEX "custom_record_values_gin_idx"`,
because Prisma cannot express a GIN index over a JsonB column and so concluded the
index the schema does not mention should go. `schema.spec.ts` caught it. The line is
now removed with a comment explaining why a regenerated diff must not reintroduce it.

**`numberSeries.upsert` is not concurrency-safe.** Prisma's upsert is a read then a
write, so two transactions issuing their first document of the year both read "absent"
and both insert; one dies on `number_series_code_year_key`. That is a failed invoice,
not a retryable error. Replaced with one `INSERT … ON CONFLICT DO UPDATE … RETURNING`,
which resolves the race inside PostgreSQL. The insert branch stores `2` so both
branches return the same "value before this allocation".

**`restrict_violation` made an immutability violation unreadable.** SQLSTATE 23001
maps to Prisma `P2003` "Foreign key constraint violated", with the real sentence
buried in `meta.driverAdapterError.cause.originalMessage`. An operator would go looking
for a bad foreign key. Plain `RAISE EXCEPTION` keeps the message where it can be read.

## Gates

```
pnpm verify                              15/15 tasks
pnpm test:integration                    42/42
pnpm test:golden                         15/15
pnpm --filter @easyerp/web test:e2e      13/13
pnpm --filter @easyerp/ops test          29/29
pnpm format:check                        clean
```

The two integration tests that would have failed earlier in the session are
`refuses to mutate a line of an issued invoice` and
`two concurrent issues receive different numbers`. Both are named in the spec file.

`ops/src/tables.ts` gained the five new tables: a restore that brings back
`customer_invoice` without its lines restores as a document that no longer adds up.

## Unresolved

- `Label` rows still do not exist. The renderer falls back to `terminology.ts`
  defaults, which ADR 0009 marks as unreviewed. `vat.exemptMention` remains an
  unapproved placeholder and must not reach a client.
- No Item or Party CRUD. `createDraft` refuses a body carrying money, but nothing
  creates the Items and Parties it prices.
- The archive is host disk. Fine for native deployment; unresolved for Vercel, where
  the filesystem is ephemeral.
- Draft editing, deletion and cancellation: `permissions.ts` has
  `customer-invoice:update` and `customer-invoice:delete` and the controller has
  neither. A Draft should be cancelled by a transition, not deleted; adding the route
  later would be a change of decision.
- No Sales Order, Credit Note, payment or allocation.
- `provisionedVersion` readiness comparison still not wired.
- Tax rates, VAT applicability, stamp duty and thresholds still need an accountant.
  Preliminary source only: `https://finco.tn/outils/calculateur-tva`.
