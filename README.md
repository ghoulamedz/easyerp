# easyERP

A multi-tenant-by-deployment ERP in TypeScript, sold to independent Businesses. NestJS API, Next.js web, Prisma + PostgreSQL, pnpm/Turborepo monorepo.

## Quick Start

**Prerequisites**: Docker only. No environment variables to set.

```bash
# From repository root
pnpm dev
```

This starts PostgreSQL, applies migrations, and runs:
- **API** on `http://localhost:3002` (serves under `/api/*`)
- **Web app** on `http://localhost:3003` (proxies `/api/*` to API)

### Key URLs Once Running

| Service | URL |
|---------|-----|
| Web App | http://localhost:3003 |
| API Health | http://localhost:3002/api/health |
| API Ready | http://localhost:3002/api/ready |

---

## Database Commands

```bash
pnpm db:up      # Start PostgreSQL + migrate both databases
pnpm db:down    # Stop PostgreSQL, keep data
pnpm db:reset   # Stop PostgreSQL + delete data directory (fixes missing easyerp_test)
pnpm db:migrate:all  # Re-apply migrations without restart
pnpm dev:apps   # Run only API + Web (assumes DB already running)
```

The database is one container on `55432` holding **two** databases:
- `easyerp` — `pnpm dev` (your rows survive)
- `easyerp_test` — `pnpm test:integration` (every table emptied between tests)

---

## Verification Gates

```bash
pnpm verify              # lint, typecheck, unit tests, build (all packages)
pnpm test:integration    # Real PostgreSQL, real transactions, real locking
pnpm test:golden         # PDF byte-for-byte comparison (7 docs × fiscal types)
pnpm --filter @easyerp/web test:e2e  # Playwright against production build
```

---

## Monorepo Structure

```
easyerp/
├── apps/
│   ├── api/          # NestJS API (port 3002)
│   └── web/          # Next.js Web (port 3003)
├── packages/
│   ├── contracts/    # Shared Zod schemas & types (source of truth)
│   └── ops/          # Operational tooling
├── docs/
│   ├── adr/          # Architecture Decision Records (0001-0017)
│   ├── specs/        # Product specifications (001, 002)
│   └── session-logs/ # Session notes
└── AGENTS.md         # Project instructions for AI agents
```

---

## Core Invariants (from ADRs)

- **Money**: PostgreSQL `numeric(18,3)`. Zero floating-point arithmetic anywhere in pricing, tax or totals. Round once, at the documented edge, HALF_UP.
- **Server prices everything**: A request carries Item and quantity, never an amount (ADR 0005).
- **Documents**: Draft or Issued. Numbering at issue; Issued documents immutable, corrected only by Credit Note (ADR 0006).
- **Stock**: Changes only by appending a Stock Ledger Entry, inside one interactive transaction, under a row lock. On-hand is derived; no balance column (ADR 0004).
- **Single-tenant schema**: No `tenant_id` column (ADR 0003).
- **Permissions**: Only authorization. `resource:action` strings, checked server-side on every request (CONTEXT.md).
- **Locales**: French, English, Arabic ship together with correct RTL (ADR 0009).

---

## Implemented Modules (Spec 001 + 002)

| Module | Status | Spec |
|--------|--------|------|
| Setup (first-run, token-gated) | ✅ | 001 |
| Settings (Business, Tax Rates, Units, Number Patterns, Terminology, Modules, Users, Roles) | ✅ | 001 |
| Catalog (Items, prices, tax rates) | ✅ | 001 |
| Parties (Customers/Suppliers, unified) | ✅ | 001 |
| Sales Orders (Draft → Issue → Reservations) | ✅ | 001 |
| Delivery Notes (Reservations → Stock Ledger) | ✅ | 001 |
| Customer Invoices (per-rate VAT, PDF archive, immutable) | ✅ | 001 |
| Credit Notes (correction, own series) | ✅ | 001 |
| Payments & Allocations | ✅ | 001 |
| Stock Ledger (append-only, reservations, available = on-hand - reserved) | ✅ | 001 |
| Purchase Orders | ✅ | 002 |
| Goods Receipts with Discrepancies | ✅ | 002 |
| Bills of Materials with versions | ✅ | 002 |
| Production Orders | ✅ | 002 |

---

## Running Tests

```bash
# All packages
pnpm test

# API only
pnpm --filter @easyerp/api test
pnpm --filter @easyerp/api test:integration

# Web only
pnpm --filter @easyerp/web test
pnpm --filter @easyerp/web test:e2e

# Contracts only
pnpm --filter @easyerp/contracts test
```

---

## Development Notes

- **API is compiled by `tsc`**, never by esbuild. NestJS resolves constructor dependencies from `design:paramtypes` metadata that `emitDecoratorMetadata` writes, and esbuild does not emit it.
- **Local ports are fixed**: API on `3002`, Web on `3003`.
- `pnpm dev` runs `nest start --watch`, not `tsx`.
- The API's OpenAPI document is generated from the shared `contracts` package.

---

## Documentation

- `CONTEXT.md` — Domain vocabulary (use terms verbatim in code, tables, types, commits)
- `docs/adr/0001-0017` — Settled architecture decisions
- `docs/specs/001-first-business-and-core-slice.md` — Core sales, stock, invoicing slice
- `docs/specs/002-purchasing-and-production.md` — Purchasing and production slice
- `docs/session-logs/` — Session notes
- `AGENTS.md` — Project instructions for AI agents

## Build Status

✅ All TypeScript errors have been resolved
✅ The project builds successfully with `pnpm build`
✅ All linting errors have been resolved
✅ Type checking passes with `pnpm typecheck`
✅ Verification suite passes with `pnpm verify`