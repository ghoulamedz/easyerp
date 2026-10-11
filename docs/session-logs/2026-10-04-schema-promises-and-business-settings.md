# 2026-10-04 — The schema's two false promises, and the Settings it was missing

## What was done

`Business` had no `vatRegime`, `currency` or `provisionedVersion`, and
`custom_record` had no index on its payload. Both are now in the database, and the
promises are asserted against a real PostgreSQL rather than against the schema file.

- `apps/api/prisma/schema.prisma` — `Business` gained `vatRegime`
  (`VARCHAR(16)`, default `STANDARD`), `currency` (`CHAR(3)`, default `TND`) and
  `provisionedVersion` (`INTEGER`, default 1). Its doc comment was corrected: it
  claimed the Business was "read from the mounted configuration file", which is the
  design ADR 0013 and spec 001 explicitly reject.
- `apps/api/prisma/migrations/20261004120000_business_settings_and_custom_record_gin/migration.sql`
  — the three columns and `custom_record_values_gin_idx` on `USING GIN (values
jsonb_path_ops)`. Every statement is guarded, so a re-run is a no-op.
- `apps/api/src/__tests__/schema.spec.ts` — four new integration tests.

The defaults are `STANDARD`, `TND` and 1 because a required Setting must always
arrive with one (ADR 0012: the release that adds a required field with no default
does not ship). They are also nearly free of risk here: `business` is empty in every
deployment, because Setup has never run anywhere, so these values are only ever what
Setup overwrites before anyone reads them.

`provisionedVersion` exists but nothing compares it yet. The API's compiled-in
version and the startup readiness check (spec 001, "Backfill and versioning") are
deliberately not in this change — a column with no reader is inert, whereas a reader
with no column is a crash.

## Strongest findings

- **The schema asserted a database fact that was false, and nothing noticed.** The
  comment on `CustomRecord` read "The GIN index over `values` is added as raw SQL in
  the first migration, because Prisma cannot express an index on a JsonB column."
  `grep -i gin` on that migration returns nothing. Prisma validates schema against
  migration only for what the schema can _express_, and a comment expresses nothing,
  so a missing index sat behind a sentence asserting it existed. A comment claiming
  an index, a constraint or a default is a claim with no gate behind it.
- **"Has the index" and "will the planner use it" are different questions, and only
  the second one matters.** With the index absent, `EXPLAIN` of a containment query
  with `enable_seqscan = off` printed `Seq Scan on custom_record / Filter: ("values"
@> '{"colour":"red"}'::jsonb)` — the planner had no alternative. That assertion is
  in the suite rather than a `pg_indexes` lookup alone, because a Business with three
  Custom Records is filtered by a sequential scan whether or not the index exists;
  that is precisely the silent full table scan ADR 0008 says the index prevents, and
  a test asserting only the index's existence would have reported it as healthy.
- **A schema change without `prisma:generate` makes the integration suite lie.** Two
  of the four tests passed against the migrated database while the generated client
  still described the old schema, failing on `expected undefined to be 'STANDARD'` —
  a failure about the build, reported as a failure about the data. `pnpm db:generate`
  is not optional after editing `schema.prisma`.
- **The `Business` comment was teaching the rejected design.** "Read from the mounted
  configuration file and mirrored here" describes two sources of truth with a silent
  drift failure — the file says 19%, the client changed it to 20%, the next deployment
  reverts it unnoticed. Spec 001 rejects that configuration file outright. Left in
  place, it invites the next reader to reintroduce it.

## Verification

Run in `/home/medo/Desktop/easyerp`, Node `v24.21.0`, against
`easyerp_test` on local PostgreSQL `55432`:

| Gate                               | Command                                                                                                                    | Result                                                                                                                                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Failing first                      | `cd apps/api && pnpm exec vitest run --config vitest.integration.config.mts src/__tests__/schema.spec.ts` before migrating | 4 failed, 0 passed — `no custom_record_values_gin_idx among custom_record_pkey, custom_record_recordType_createdAt_idx`, and `expected 'Seq Scan on custom_record…' to contain 'custom_record_values_gin_idx'` |
| Green                              | same command after `pnpm db:migrate:all`                                                                                   | 4 passed                                                                                                                                                                                                       |
| Migration is idempotent            | the migration's own SQL piped through `psql` against the already-migrated database                                         | exit 0, four `already exists, skipping` NOTICEs                                                                                                                                                                |
| Lint, typecheck, unit tests, build | `pnpm verify`                                                                                                              | 15/15 tasks                                                                                                                                                                                                    |
| Integration                        | `pnpm test:integration`                                                                                                    | 27 passed (was 23)                                                                                                                                                                                             |
| Formatting                         | `pnpm format:check`                                                                                                        | clean                                                                                                                                                                                                          |

The red run was taken against a database that genuinely had neither the columns nor
the index — confirmed first by reading `information_schema.columns` and `pg_indexes`
directly — so it is evidence about the schema rather than about a broken fixture.

**Not rerun:** `pnpm --filter @easyerp/web test:e2e`. It drives the built web app
against the API's health and readiness endpoints, none of which read these columns.
It was green against this tree earlier today and is not evidence for this change.

## Artifacts written

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20261004120000_business_settings_and_custom_record_gin/migration.sql`
- `apps/api/src/__tests__/schema.spec.ts`
- `docs/session-logs/2026-10-04-schema-promises-and-business-settings.md`

## Unresolved

- Nothing reads `vatRegime`, `currency` or `provisionedVersion` yet. Setup writes
  them and Settings edits them; neither exists. The columns and the renderer that
  consumes them are correct and unused, and each is closed end to end by the slice
  that first reads it.
- The compiled-in expected `provisionedVersion` and the readiness comparison against
  it are still to be written. Until they exist, a Business whose Settings were
  half-migrated would serve traffic instead of failing readiness.
- `docs/specs/001-first-business-and-core-slice.md:193` still lists the GIN index as
  missing, which is now false. Left for the same reason as the padding item: whether
  that document is the amendable implementation contract is still open (Q1).
- `custom_record.values` has a GIN index but no query that uses it. Custom Records
  are stored and listed; filtering them by a Custom Field is out of scope for this
  slice, so the index currently serves nothing.

## Next steps

1. Write the document golden test across 3 locales and both VAT regimes — the last
   gate in `AGENTS.md` with nothing behind it.
2. Neon and Vercel deployment, both still blocked on authentication.
3. Revisit Q1 and Q2, then strike the four stale "Fix required" lines in spec 001.
