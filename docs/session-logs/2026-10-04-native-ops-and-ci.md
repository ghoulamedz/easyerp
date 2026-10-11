# Session — native deployment ops, restore drill, CI

Date: 2026-10-04

## Done

- **Fixed `scripts/db.mjs`.** A prior edit deleted the `migrateBoth()` declaration
  while `up` and `migrate` still called it, so `pnpm db:up` died with
  `ReferenceError: migrateBoth is not defined`. Confirmed by running it, restored,
  re-verified.
- **Rewrote `ops/` for native PostgreSQL + systemd** (ADR 0013). `shared.ts` lost
  `composeCommand` for `rsyncArgs` / `unitOf` / `systemctlCommand` / `withHostEnv`.
  `deploy.ts` is now: env file → rsync → install+build → migrate → restart → wait for
  `/api/ready`, dumping the API journal on failure. `backup.sh` uses `pg_dump -Fc` as
  the `postgres` OS user. `status.ts` reports unit state and `postgresql.service`
  separately from the readiness probe.
- **Fixed the restore drill.** It listed Prisma _model_ names (`AuthUser`, `Item`,
  `StockMovement`, `Document`) that no table has ever had — a check that can only
  fail, which is why it had never been run. Now `@@map` values, plus a completeness
  check that derives the expected set from the live database so it cannot drift.
- **Found a second always-red defect by running it.** `pg_dump` does not dump planner
  statistics, so `reltuples` reads `-1` for every table in a fresh restore. The
  non-empty check now uses `to_regclass` for existence plus a real `count(*)`, and
  requires rows only for `business` — the one row a deployed instance cannot lack
  (ADR 0012). There is no seed yet, so requiring rows anywhere else would repeat the
  same defect.
- **Added `ops/src/tables.ts` + `tables.test.ts`** (7 tests). The drill acts at module
  top level, so its constants had to move to be testable at all.
- **Rewrote CI** to three jobs: `verify`, `integration`, `e2e`. Added
  `.github/actions/setup` composite action. Removed the container-image job and
  deleted `infra/docker/`, `infra/compose/compose.yaml`, `infra/compose/.env.example`.
  Moved the Caddyfile to `infra/caddy/Caddyfile` with systemd upstreams.
- **Made the browser gate real.** Playwright now starts the built API as well as the
  web build, and one test reads the live API through the web app's proxy instead of a
  `page.route` stub. Removed `output: 'standalone'`.
- **Refreshed `.env.example`**, which still pointed at 5432 and described a container
  network.

## Findings

- `deploy.ts`'s `prisma generate` is not optional: `apps/api/src/generated/` is
  gitignored and the API's build step copies it into `dist`. Without it the build
  fails on a missing path rather than on anything to do with the code.
- The old production `compose.yaml` had a `migrate` service built from the API
  Dockerfile, but that image does not contain a Prisma CLI. It could never have run.
- Prisma 7 has no `directUrl`; `scripts/direct-url.mjs` is the whole mechanism.
- `reltuples` is unusable as a "did the rows come back" signal on a restored
  database. Verified by restoring a real dump, not by reasoning about it.

## Verified

`pnpm verify` 15/15 · `pnpm format:check` clean · `pnpm test:integration` 23/23 ·
`pnpm --filter @easyerp/web test:e2e` 13/13 · `pnpm db:validate` valid ·
`pnpm dev` cold start, `/api/ready` 200 with `database: ok`, web 200 ·
restore drill's SQL exercised against real PostgreSQL: dump → scratch DB → restore →
compare → drop, passing with all 14 tables and a populated `business`, and failing
both when a table is dropped (caught twice, independently) and when `business` is
emptied.

Mutation-checked the new tests: injecting a model name and an unmigrated table fails
3 of them; adding `auth_session` to the must-have-rows list fails its guard; pointing
`API_INTERNAL_URL` at a dead port fails the new e2e test while both stubbed tests
still pass.

## Not verified

- `pnpm ops:deploy` / `ops:status` / `ops:backup` / `ops:restore-drill` have never run
  against a real host. rsync, systemd and `sudo` need a VPS; `ops/clients.yaml` still
  names the placeholder `srv-01.easyerp.tn`.
- The Vercel + Neon demo has not been deployed. Whether the raw Better Auth
  `auth.nodeHandler` survives Vercel's NestJS function wrapper is still untested.
- The CI workflow itself has never executed — there is no GitHub remote here.

## Next

1. Provision a VPS: native PostgreSQL, two systemd units, Caddy from
   `infra/caddy/Caddyfile`. Then run `ops:deploy`, `ops:backup`, `ops:restore-drill`
   against it before trusting any of this.
2. Deploy the demo to Vercel + Neon; verify migrations over the direct URL and that
   Better Auth signs in behind the function wrapper.
3. Revise `docs/specs/001-first-business-and-core-slice.md` for the two targets, the
   empty greenfield database, Areas/Modules, and Slice 0. Q1 and Q2 are still open.
4. The document golden test (3 locales × 2 document regimes plus mixed Tunisian
   rates) still does not exist.
5. Accountant confirmation on Tunisian VAT and e-invoicing.
