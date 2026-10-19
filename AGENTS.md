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

## Git

**Never commit or push on your own initiative.** Finish the edits, run the gates, and report what
changed and what ran — then stop. A commit is the author's decision, not a step in the task: it fixes
a boundary the human may want to move, and a push publishes that boundary to everyone else.

- Leave the working tree modified and say so in the summary (which files, and why they are unstaged).
- Stage nothing. `git add -A` before reporting is the same decision made quietly.
- When the human asks for a commit, do it then — and if they asked for one commit, do not split it
  into four, or squash their in-progress work into it.
- A push is a separate yes from a commit, unless the request named both.
- Reading history is always fine: `git log`, `git diff`, `git show`, `git blame`. Inspecting an
  unmodified baseline (`git stash` and restore) is encouraged when it makes a claim checkable.

## Before claiming done

Run the scripts `package.json` defines for the changed package, and report what actually ran. A claim is only as good as the command that produced it, and an unrun command is a hypothesis — say so.

These gates cover a change before delivery: lint, strict typecheck, unit tests, integration tests against real PostgreSQL, Playwright e2e, and the assertions that a printed document carries the stored data. "It compiles" is not a gate, and neither is a green unit suite — every test must be able to fail.

The document matrix is not restated here. Which locales, VAT regimes and tax rates it covers, and why, is decided by `docs/specs/`; this file names the gate so it cannot be quietly dropped.

Document printing is gated without a browser, and deliberately not by comparing
rendered files byte for byte.

- **`pnpm verify` covers it.** `apps/api/src/**/__tests__/*-print-consistency.test.ts` read the view
  the server renders from and require its figures on the page: the number, the party, the issuer's
  legal identity, every money amount to the stored three decimals, each tax rate of the breakdown
  with its base and amount, the FODEC and stamp-duty lines, and never a placeholder. Restyling a
  table, moving a column or rewording a label does not fail them; printing a different figure,
  losing a tax group or rounding a total does.
- **`apps/api/src/documents/__tests__/print-contract.test.ts`** asserts the structural properties no
  fixture should be able to bless away: A4 with a margin, nothing to fetch, logical properties only
  (the RTL regression), an Arabic-capable font stack, `dir` from the locale.
- **Not covered:** pagination and glyph shaping. Both need a layout engine and there is none in the
  toolchain. An invoice that spills onto a third page, or Arabic that joins badly, is caught by
  printing one.
- **A byte-for-byte golden is the wrong tool here.** It is re-blessed from the code that produced it,
  so a wrong figure re-blessed becomes the wrong baseline, and every cosmetic edit turns the gate
  red. Two such suites existed and were deleted; one of them had blessed an invoice with no tax
  identifier on it for its whole life.

- `pnpm verify` — lint, typecheck, unit tests and build across every package. The fast gate; run it before anything else.
- `pnpm test:integration` — real PostgreSQL, real transactions, real locking, **and a real `AppModule` that is actually started**. It needs nothing set up: `pnpm db:up` has already pointed `apps/api/.env.test` at `easyerp_test` and migrated it. There is no skip; the suite fails rather than passing empty. A change that alters the module graph, a guard, or a provider binding is not done until this passes — a broken injection graph passes every unit test and only shows up when a client starts the server.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
