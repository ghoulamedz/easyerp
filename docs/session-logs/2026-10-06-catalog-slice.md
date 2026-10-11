# Slice 3 (Catalog & counterparties): Items and Parties

Third vertical slice of the expansion (spec 001 stories 25–32, Q10), the sibling
of `2026-10-06-settings-slice.md`. Adds the Item catalog and the composite Party
record — every Module's documents price from these two masters — with offset
pagination on every long collection. No web UI; the routes are for the contract.

## What was done

- `packages/contracts/src/pagination.ts`: `pageQuerySchema` (coerced `page`,
  `pageSize` capped at `PAGE_SIZE_MAX = 100` so one query cannot scan the
  catalog, optional `q`) and `paginatedSchema(record)` returning the
  `{ items, total, page, pageSize }` envelope. `pageSize` defaults to 25.
- `packages/contracts/src/catalog.ts` rework: `partySchema.customerTerms` optional
  and only meaningful for the CUSTOMER role; `itemInputSchema` and
  `partyInputSchema` are `.strict()` — a screen typo is never dropped. Items keep
  their prices in input because an Item owns its prices (ADR 0005); `isService`
  is absent from input and derived server-side from `itemType === 'SERVICE'`.
  `partyInputSchema` includes `isActive`, so a Party is retired by a partial
  PATCH exactly as an Item is. The deleted `customerTermsSchema`/`CustomerTerms`
  are history — the terms fold into the party input/response.
- Prisma: three nullable `party` columns (`paymentTermDays Int?`,
  `creditLimit Decimal(18,3)?`, `deliveryAddress VarChar(500)?`), deliberately a
  column set on the composite row rather than a second terms table, because a
  Customer is one role of one record. Migration `20261006140000_catalog_crud_party_terms`
  also adds `pg_trgm` and four **trigram GIN indexes** (`item_code_trgm_idx`,
  `item_name_trgm_idx`, `party_code_trgm_idx`, `party_name_trgm_idx`) for the
  `ilike '%…%'` search — a btree cannot serve it. Hand-written because Prisma
  cannot express a GIN, matching the custom-record precedent. Applied to both
  databases (`pnpm db:migrate:all`).
- `apps/api/src/catalog/`: `item.service.ts`, `item.controller.ts`,
  `catalog.module.ts`. Surface: POST `/items` (201) / GET `/items` (paged+`q`)
  / GET `/items/:id` / PATCH `/items/:id`. Unique `code` → 409; every referenced
  Unit/Tax Rate must exist and the rate must be active (retired rate → 422);
  `isService` derived on read; `item.created`/`item.updated` audited on the
  caller's transaction. **No DELETE route** — `item:delete` exists in the
  permission catalog and is unused here, the same deliberate absence as the
  Customer Invoice.
- `apps/api/src/parties/`: `party.service.ts`, `party.controller.ts`,
  `parties.module.ts`. Same surface plus the terms rule: `customerTerms` only
  travel with the CUSTOMER role (non-CUSTOMER with terms → 422); dropping the
  role clears the three columns **in the same write**; an unrelated edit (e.g. a
  name change) preserves them. Duplicate `code` or `taxIdentifier` → 409. No
  DELETE route; a Party is retired.
- `apps/api/src/app.module.ts`: `CatalogModule` + `PartiesModule` imported.
- OpenAPI: registered the item/party schemas and the CRUD paths (collections as
  `paginatedSchema(...)`; `input.partial()` documents the PATCH body).
- `apps/api/src/catalog/__tests__/catalog.integration.spec.ts`: **15 tests**,
  booted exactly as `main.ts` wires the AppModule.

## Strongest findings

1. **The two masters are deliberately not Module-gated.** The five Modules are
   capabilities; Items and Parties are the shared substrate those capabilities
   stand on (Purchasing imports from a supplier the Sales module sells to). They
   answer whenever the session exists, like Settings and Identity. The comment in
   `item.controller.ts` says why, so a future gate does not turn a purchasing-only
   Business into one that cannot buy.
2. **Zod nullable fields are present-but-null, not optional.** `purchaseUnitId:
null` passes; omitting the key is a 422. The 201-tests failed exactly this way
   until the payload set every nullable field explicitly. That strictness is the
   point — the schema is the contract — but it costs even, well-formed clients a
   full shape: a Party create must send `email/phone/address/city/countryCode` as
   null.
3. **Prisma `Decimal` has no `toString` contract that preserves scale.**
   `row.creditLimit.toString()` returned `"5000"` for a stored `5000.000` and the
   response schema, which demands exact decimal strings, would not round-trip.
   `toFixed(3)` is the fix and matches `formatAmount`'s always-3-decimals rule.
4. **A unique violation is the API's first conflict surface.** `P2002` maps to a
   named 409, and `error.meta.target` — typed as a bare `{}` by the generated
   client — is read through a narrow cast to distinguish `code` from
   `taxIdentifier` for Parties.

## Gate runs

- `pnpm --filter @easyerp/contracts test` — 75 passed; typecheck, build clean.
- `pnpm --filter @easyerp/api test` — 41 passed; typecheck, lint clean.
- `pnpm test:integration` — **80 passed, 7 files**. The 15 new ones cover: item
  create with decimals intact + audit, isService derivation, strict-typo 422,
  unit/rate/retired-rate refusal, duplicate-code 409, partial edit + retire,
  search + pagination envelope, **no DELETE route** asserted by `404` while the
  row survives, customer-with-terms / supplier-without / supplier-with-terms 422,
  terms preserved on unrelated edit and cleared on role drop (columns nulled in
  the DB), duplicate party code + taxIdentifier 409, party search + paging,
  party retire, and unknown-id 404s.
- `pnpm verify` — 15/15 tasks green.
- `pnpm test:golden` — green (unchanged rendering; no template touched).
- `pnpm format:check` — clean (after `pnpm format`).
- `ops` — 29 passed.

## Unresolved / next

- The web connection: Items and Parties screens against these routes, plus the
  purchase-price-on-item caveat for the purchasing UI, are a later slice.
- Search order: `orderBy code asc`, no relevance scoring. The trigram indexes
  already exist; ranking is a presentation concern.
- A second `taxRateId` reference pattern (rate with `activeFrom` windows vs the
  "one active rate" the invoice template prints) is the numbering/POS slice's
  problem, not this one's.
- `Paged<T>` is imported into `parties` from `catalog/item.service.ts` as a
  type-only symbol; if a fourth collection needs the envelope, move it into the
  contracts package.
