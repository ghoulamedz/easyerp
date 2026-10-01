# easyERP

A multi-tenant-by-deployment ERP in TypeScript, sold to independent Businesses. NestJS API, Next.js web, Prisma + PostgreSQL, pnpm/Turborepo monorepo. See `docs/adr/` for the decisions and `CONTEXT.md` for the vocabulary.

## Read before writing code

- **`CONTEXT.md`** — the domain vocabulary. Use its terms verbatim in code, tables, types and commits; a new name is a change to the glossary, not a local synonym.
- **`docs/adr/0001-0011`** — the settled decisions. Treat them as the contract: if code and an ADR disagree, the code is wrong. Read the ADR for the reasoning when a decision looks surprising, before changing it.
- **`/home/medo/Desktop/rayhan_rapport.md`** — the static audit of the legacy app being replaced. When designing a module, check its section 1 (security) and section 2 (business logic) to see the defect that module must not reproduce.

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

These gates cover a change before delivery: lint, strict typecheck, unit tests, integration tests against real PostgreSQL, Playwright e2e, and the document golden test across 3 locales × 3 VAT regimes. "It compiles" is not a gate.

- `pnpm verify` — lint, typecheck, unit tests and build across every package. The fast gate; run it before anything else.
- `pnpm test:integration` — real PostgreSQL, real transactions, real locking. Needs `DATABASE_URL`: start `docker compose -f infra/compose/compose.test.yaml up -d`, then `pnpm --filter @easyerp/api prisma:migrate:deploy`. There is no skip; the suite fails rather than passing empty.
- `pnpm --filter @easyerp/web test:e2e` — Playwright against a production build.

Anything touching stock, money, numbering or an Issued document additionally needs a test that would have failed before the change. Concurrency changes need two-writer coverage.

## Naming and shape

Model the domain in `apps/api/src/<domain>/` (sales, purchasing, inventory, production, finance, identity). Shared request/response types live in `packages/contracts` and are the source for the OpenAPI document — the API and the web app import them, they are never re-declared.

## Session notes

Append a durable note per meaningful session to `/home/medo/notes/session-logs/`: what was done, strongest findings, artifacts written, unresolved questions, next steps. Use the handoff skill at the end of a session that leaves unfinished work.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
