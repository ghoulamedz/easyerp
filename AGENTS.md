# easyERP

A multi-tenant-by-deployment ERP in TypeScript, sold to independent Businesses. NestJS API, Next.js web, Prisma + PostgreSQL, pnpm/Turborepo monorepo. See `docs/adr/` for the decisions and `CONTEXT.md` for the vocabulary.

## Read before writing code

- **`CONTEXT.md`** — the domain vocabulary. Use its terms verbatim in code, tables, types and commits; a new name is a change to the glossary, not a local synonym.
- **`docs/adr/0001-0012`** — the settled decisions. Treat them as the contract: if code and an ADR disagree, the code is wrong. Read the ADR for the reasoning when a decision looks surprising, before changing it.
- **`docs/legacy-app-audit.md`** — the static audit of the legacy app being replaced, and the defect each module must not reproduce. Everything needed from the original audit lives in this repository; do not look for it outside.

## Toolchain constraints

- **The API is compiled by `tsc`, never by esbuild.** NestJS resolves constructor dependencies from the `design:paramtypes` metadata that `emitDecoratorMetadata` writes, and esbuild does not emit it. Running the API through `tsx` — which uses esbuild — produces `Nest can't resolve dependencies of the SessionGuard (?, Symbol(SESSION_PROVIDER))`, because every parameter without an explicit `@Inject` becomes `unknown`. `pnpm dev` therefore runs `nest start --watch`, not `tsx`. `src/__tests__/app.module.spec.ts` asserts the metadata is present so a future toolchain change names the cause instead of the symptom.
- **Local ports are fixed**: the API on `3002`, the web app on `3003`. Everything the API serves lives under `/api`, so `/api/health` and `/api/ready` are the two addresses worth knowing. `next.config.ts` proxies `/api/*` to the API's own default, so development needs no environment variables. `apps/api/.env` is read by the dev script only; a deployment passes its environment through the container.

## Running it locally

One command, from the repository root, is the whole local setup:

```bash
pnpm dev
```

It starts PostgreSQL, applies the migrations, and runs the API on `3002` and the web app on `3003`. It needs Docker and nothing else — no environment variables to set, no database to create, no migration to remember. `apps/api/.env` and `apps/api/.env.test` are already pointed at it.

The database is one container on `55432` holding **two** databases, on purpose:

| Database       | Used by                 | Behaviour                            |
| -------------- | ----------------------- | ------------------------------------ |
| `easyerp`      | `pnpm dev`              | your rows survive                    |
| `easyerp_test` | `pnpm test:integration` | every table is emptied between tests |

They are separate because `resetDatabase()` deletes every row in every table. One shared database would mean running the tests deletes the Business you were working on. `harness.ts` refuses any database whose name does not look disposable, so the mistake fails loudly instead of destructively.

The rest of the database commands:

- `pnpm db:up` — start PostgreSQL and migrate both databases.
- `pnpm db:down` — stop it, keep the data.
- `pnpm db:reset` — stop it and delete the data directory.
- `pnpm db:migrate:all` — re-apply migrations without restarting anything.
- `pnpm dev:apps` — run only the API and web app, against a database you started yourself.

`pnpm db:reset` is also the fix for a missing `easyerp_test`: `init/01-create-test-database.sql` runs only against an empty data directory, so it is skipped on every start after the first.

## Invariants

These hold in every file. Each is a one-line restatement of an ADR; the ADR holds the reasoning.

- Money is PostgreSQL `numeric(18,3)`. Zero floating-point arithmetic anywhere in pricing, tax or totals. Round once, at the documented edge, HALF_UP.
- The server resolves every unit price and tax rate. A request carries Item and quantity, never an amount.
- A Document is Draft or Issued. Numbering happens at issue; Issued documents are immutable and corrected only by Credit Note. A delete endpoint for an Issued document does not exist in the API surface.
- Stock changes only by appending a Stock Ledger Entry, inside one interactive transaction, under a row lock. `On-hand` is derived; there is no balance column.
- Single-tenant schema: no `tenant_id` column.
- Permissions are the only authorization. `resource:action` strings, checked server-side on every request; the interface grants nothing.

## Before claiming done

Run the scripts `package.json` defines for the changed package, and report what actually ran. A claim is only as good as the command that produced it, and an unrun command is a hypothesis — say so.

These gates cover a change before delivery: lint, strict typecheck, unit tests, integration tests against real PostgreSQL, Playwright e2e, and the document golden test. "It compiles" is not a gate, and neither is a green unit suite — every test must be able to fail.

The golden test's matrix is not restated here. Which locales, VAT regimes and tax rates it covers, and why, is decided by `docs/specs/`; this file names the gate so it cannot be quietly dropped.

- `pnpm verify` — lint, typecheck, unit tests and build across every package. The fast gate; run it before anything else.
- `pnpm test:integration` — real PostgreSQL, real transactions, real locking, **and a real `AppModule` that is actually started**. It needs nothing set up: `pnpm db:up` has already pointed `apps/api/.env.test` at `easyerp_test` and migrated it. There is no skip; the suite fails rather than passing empty. A change that alters the module graph, a guard, or a provider binding is not done until this passes — a broken injection graph passes every unit test and only shows up when a client starts the server.
Document rendering is gated in **two tiers**, and neither replaces the other.

- **Print goldens — in `pnpm verify`, no browser.** `apps/api/src/**/__tests__/*-print-golden.test.ts`
  renders every paper to the HTML that `GET <paper>/:id/print` serves and compares it **byte for
  byte** against committed `.html` files under `apps/api/src/__tests__/goldens/print/`. The matrix is
  the Customer Invoice's 3 locales × 2 VAT regimes plus a mixed-rate one, and `fr`/`en`/`ar` for each
  of the five operational papers. It is a unit test because it needs nothing installed, so a changed
  table header fails on the commit that causes it. `apps/api/src/documents/__tests__/print-contract.test.ts`
  asserts the properties a future template must keep: A4, no script and nothing to fetch, logical
  properties only (the RTL regression), an Arabic-capable font stack.
- **`pnpm test:golden` — the browser tier.** Renders the same HTML through headless Chromium and
  compares **byte for byte** against committed PDFs. It needs
  `pnpm --filter @easyerp/api exec playwright-core install --with-deps chromium` and
  `fonts-noto-core fonts-dejavu-core`, because Chromium substitutes a missing font instead of
  failing. It is the only gate that can prove pagination and Arabic glyph shaping actually came out
  right, because it is the only one with a layout engine.

Re-blessing either tier is explicit: `UPDATE_GOLDENS=1 pnpm --filter @easyerp/api test` for the
print goldens, `pnpm test:golden -- --update` for the PDFs. **Then read the diff.** A re-bless nobody
read is how a layout regression becomes the new baseline.
- `pnpm --filter @easyerp/web test:e2e` — Playwright against a production build. It seeds its own
  fixture through the real `POST /api/setup`, so it needs a database with **no Business** in it
  (that is what CI has): on a working database with a Business already set up, Setup is correctly
  closed and the suite refuses to start with one explanatory message rather than a dozen URL
  mismatches. Point `DATABASE_URL` at a fresh database to run it — `easyerp_test` and `easyerp`
  both work after `pnpm db:reset`.

Anything touching stock, money, numbering or an Issued document additionally needs a test that would have failed before the change. Concurrency changes need two-writer coverage.

## Naming and shape

Model the domain in `apps/api/src/<domain>/` (sales, purchasing, inventory, production, finance, identity). Shared request/response types live in `packages/contracts` and are the source for the OpenAPI document — the API and the web app import them, they are never re-declared.

## Session notes

Append a durable note per meaningful session to `docs/session-logs/`: what was done, strongest findings, artifacts written, unresolved questions, next steps. Use the handoff skill at the end of a session that leaves unfinished work.

Everything the next session needs lives in this repository. Do not reach outside it for context — if something is missing, the note belongs in `docs/session-logs/` and the finding belongs in `docs/legacy-app-audit.md`.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
