# Slice 1 (Setup): the gate a fresh deployment knocks on

First vertical slice of the expansion, implementing ADR 0012 end to end. The grilling
decision index is in `2026-10-06-expansion-decisions.md`; this log is the code that
resulted from the Setup slice.

## What was done

- `packages/contracts/src/setup.ts` + unit tests: `setupStatusSchema`,
  `setupRequestSchema` (strict surface, min 1 Unit, STANDARD/EXEMPT regimes,
  `taxRates` default empty — the STANDARD-requires-one rule is deliberately a service
  rule, because it needs the business row, not the wire), `setupResultSchema`.
  Added the `bom: ['bom:read','bom:create']` permission group to
  `packages/contracts/src/permissions.ts` so the Administrator role inherits it via
  `allPermissions` without a migration.
- `FIRST_SETUP_TOKEN` in `apps/api/src/config/env.ts` (min 8, dev default, production
  guard refusing the default). Added to `.env`, `.env.test`, `.env.example`, with the
  rationale in the template.
- `apps/api/src/setup/`: `SetupService`, `SetupController` (`GET status`, `POST
complete`), `SetupModule` registered in `AppModule`. The service creates in one
  transaction: Business, Units, Tax Rates (≥1 when STANDARD), a Number pattern for all
  seven Document types (defaults in `DEFAULT_NUMBER_PATTERNS`), the first
  Administrator (AuthUser + AuthAccount `providerId: 'credential'` hashed with
  `better-auth/crypto`), the ADMINISTRATOR role assignment, and one AuditEntry with a
  null actor. Token compared constant-time (sha256 + `timingSafeEqual`). The whole
  write sits behind `pg_advisory_xact_lock(hashtext('easyerp:setup:provision')::bigint)`
  and re-checks the Business count inside the transaction.
- `apps/api/src/setup/__tests__/setup.integration.spec.ts` — the first spec to boot a
  **real AppModule over HTTP** with `main.ts`'s exact middleware wiring: a hand-built
  Express server, Better Auth mounted at `/api/auth` before any body parser, the
  `DomainExceptionFilter`, `setGlobalPrefix('api')`. Leaving any of those out produced a
  different, instructive failure each time (see below).

## Strongest findings

1. **`NestFactory.create(AppModule, …)` does not install what `main.ts` installs.**
   `app.module.spec.ts` only booted the graph and called `/api/health`, so nothing
   forced it to repeat `main.ts`. The Setup spec is the first test whose assertions
   depend on the domain-to-HTTP error mapping and on the real sign-in route, and it
   failed three distinct ways before the wiring was replicated: unmounted filter →
   every `DomainError` as a 500 (including "token invalid" as 500); unmounted auth
   handler → `/api/auth/sign-in/email` 404; missing `ExpressAdapter(server)` → no raw
   `.use()` to mount the handler on. The lesson generalises: **HTTP-behavioural specs
   must rehydrate `main.ts`, or they validate a different app than the one deployed.**
2. **Prisma returns Json columns already parsed** — `audit.after` is an object, not a
   string; `JSON.parse(String(...))` on it produced the classic `[object Object]`
   crash. The audit service stores an object; readers must treat the column as Json.
3. The `documents.ts` contract already defined `VAT_REGIMES`/`vatRegimeSchema`/`VatRegime`,
   so `setup.ts` re-exports rather than re-declares — the second time this session a
   hand-rolled duplicate was caught by a typecheck `error TS2308`.
4. `@easyerp/contracts` is consumed via `dist/`, so a contracts API change needs
   `pnpm --filter @easyerp/contracts build` before the API typechecks against it.

## Gate runs

- `pnpm --filter @easyerp/contracts test` — 40 passed.
- `pnpm verify` — 15/15 tasks green (lint, typecheck, unit, build across packages).
- `pnpm test:integration` — 51 passed (9 from this spec: status, bad token,
  full provisioning + audit, real sign-in, second-visit 404, STANDARD-no-rate 422,
  EXEMPT-no-rate 201, duplicate-unit rollback, two-visitor concurrency).
- `pnpm format:check` — clean.

## Unresolved / next

- Slice 2: Settings (spec 001 stories 8–24). After that: Catalog+Parties, sales
  pipeline, Payments/balance, Credit Note, Purchasing, Production/BOM, Stock UI/CSV,
  backfill/`provisionedVersion`, dashboard/nav/e2e.
- The web app has no Setup screen yet; the sign-in screen's `needsSetup` probe
  (`GET /api/setup/status` → route to `/setup` or `/sign-in`) lands with the web work.
- Deployment blockers unchanged (Neon auth, Vercel CLI, VPS, archive storage,
  terminology/Label, accountant review).
