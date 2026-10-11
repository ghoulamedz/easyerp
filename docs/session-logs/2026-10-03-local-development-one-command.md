# 2026-10-03 — one command to run and test easyERP locally

## What was done

Made `pnpm dev` the whole local setup. One command starts PostgreSQL, applies the migrations to both databases, and runs the API on `3002` and the web app on `3003`. Docker is the only prerequisite — no environment variables to write, no database to create, no migration to remember.

Artifacts:

- `infra/compose/compose.local.yaml` (renamed from `compose.test.yaml`) — now the local database for development **and** integration tests, not tests only. One container on `55432` holding two databases.
- `infra/compose/init/01-create-test-database.sql` — creates `easyerp_test` alongside the default `easyerp`.
- `scripts/db.mjs` — `up`, `down`, `reset`, `migrate`. Migrations are applied by the script rather than left as a step to remember.
- `apps/api/.env.test` — **was missing entirely**, although `spec:213` promised a committed one. `.gitignore` already allowed it. This is why `pnpm test:integration` previously needed a hand-exported `DATABASE_URL`.
- `apps/api/.env` — repointed from `localhost:55433` to the documented `55432`.
- `AGENTS.md` — new "Running it locally" section; both external filesystem references removed.
- `CONTEXT.md` — `Module`/`Area`/lowercase _module_ disambiguation (accepted Q3), plus a short local-instance section.
- `apps/api/src/identity/__tests__/harness.ts` — error messages point at the renamed file.

Root scripts: `dev` (full setup), `dev:apps` (apps only), `db:up`, `db:down`, `db:reset`, `db:migrate:all`.

## Strongest findings

**Three PostgreSQL containers were running on one laptop.** `easyerp_test-postgres-1` on 55432 (the old compose test stack), `easyerp-dev-db` on 55433 (created by a bare `docker run` whose only trace was a comment in a gitignored `.env` — "the container in `docker run` from the session log"), and `easyerp-postgres-1` (the per-Business deployment stack, running on a development machine). The dev run and the test suite could only coexist because of two undocumented containers and two undocumented ports. That is not a setup, it is an accident that happened to work. Removed the first two; the deployment stack was left untouched.

**The advisory lock is load-bearing, and is now proven rather than asserted.** With `pg_advisory_xact_lock` replaced by a no-op, the two concurrency tests fail exactly as the design predicts: both removals succeed and the Business ends with **zero** administrators (`expected [] to have a length of 1`), and both deactivations succeed (`expected [...] to have a length of 1 but got 2`). Restored, 23 pass. This is the first evidence in the repository that the last-administrator invariant actually holds under two writers.

**`pnpm test:integration` had never run here.** It now passes 23 tests against real PostgreSQL, with the two two-writer concurrency tests among them. Every prior claim that the suite existed was a hypothesis.

**Playwright's 12 e2e tests had never run here either** — they failed on a missing browser until `playwright install chromium` completed the headless-shell download. All 12 pass now. **But they prove less than their names suggest:** `apps/web/playwright.config.ts` starts only Next.js, and `rtl.spec.ts` stubs `/api/health` and `/api/ready` with `page.route`. The run is full of `ECONNREFUSED 127.0.0.1:3002` from the proxy, and the test named "reports operational when both endpoints answer" answers to its own stub. The API is never started and never reached. Accepted Q6 already puts this in Slice 0; this is the concrete shape of it.

## Verification

Everything below ran, on this machine:

| Gate                         | Command                               | Result                                                              |
| ---------------------------- | ------------------------------------- | ------------------------------------------------------------------- |
| Lint, typecheck, unit, build | `pnpm verify`                         | 15/15 tasks                                                         |
| Integration tests            | `pnpm test:integration`               | 23 passed — first ever run                                          |
| Mutation check               | lock replaced by a no-op              | 2 concurrency tests fail, as designed                               |
| Browser tests                | `pnpm --filter @easyerp/web test:e2e` | 12 passed — first ever run                                          |
| Formatting                   | `pnpm format:check`                   | clean                                                               |
| Cold start                   | `pnpm db:reset` then `pnpm dev`       | `/api/ready` = `{"status":"ok","checks":{"database":"ok"}}` in ~15s |
| Both databases               | `psql` against the container          | `easyerp` 16 tables, `easyerp_test` 16 tables                       |

Still not verified, and not to be described as passing: the document golden test (3 locales × 3 VAT regimes) does not exist; there is no PDF renderer. `infra/compose/compose.yaml` and both Dockerfiles have never been built.

## Unresolved questions

1. **Production PostgreSQL on the VPS** — native or managed. Still unanswered, and it blocks the hosting ADR.
2. **Does the demo API run on Vercel, or only Next.js?** NestJS cannot run unchanged there: `main.ts` calls `server.listen` and mounts Better Auth on the raw Express server. Still unanswered.
3. **Q1 and Q2** — the spec-as-contract and the Document-seam questions — were explained but not answered.
4. **Tunisian VAT and e-invoicing** need an accountant. Rates found are 19% / 13% / 7%; `VAT_REGIMES = STANDARD | EXEMPT` is a document-treatment concept, not the set of Tunisian rates, so "3 locales × 3 VAT regimes" is a conflation to correct in the spec.
5. The orphaned volume `easyerp-dev-db-data` is no longer used by anything.

## Next steps

1. Answer the two hosting questions, then write the ADR that supersedes or amends ADR 0002 and the Docker assumptions in `ops/` and `infra/compose/compose.yaml`.
2. Answer Q1 and Q2, then amend `docs/specs/001-first-business-and-core-slice.md`: Areas not Modules, the catalog → inventory → sales → finance order, and Slice 0.
3. Slice 0, per accepted Q6: make `playwright.config.ts` start the API against the local database and stop stubbing health, so the e2e gate reaches the module graph.
4. Fix the blocking defects already identified: `renderDocumentNumber()` ignores `NumberPattern.padding`; `Business` lacks `provisionedVersion`, `vatRegime`, `currency`; `custom_record.values` GIN index absent; `ops/src/restore-drill.ts` checks Prisma model names instead of snake_case table names.
