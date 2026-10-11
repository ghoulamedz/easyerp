# 2026-10-09 — Items screen fix, verify + integration green

## What was done
- Rewrote `apps/web/src/app/[locale]/(app)/items/page.tsx` as a server component
  (metadata + `PageHeader` + `<ItemsList>`) and created
  `apps/web/src/components/items-list.tsx` as the `'use client'` list screen
  (loading / failed / empty / ready, permission-gated `item:create` action).
- Fixed root causes of the typecheck loop: `PageHeader` takes `action` as a prop
  and no children (stray `</PageHeader>` removed), `Link` from `next/link`,
  item URL without the `/(app)/` group (`/${locale}/items/new`), `name` field
  from the `Item` contract.
- Fixed 3 stale test imports (`sales-order`, `delivery-note`, `customer-invoice`
  specs): `../numbering/` → `../../numbering/`.
- Fixed web lint `react-hooks/set-state-in-effect` in `use-collection.ts` by
  removing the synchronous `setResult({state:'loading'})` inside the effect
  (stale-while-revalidate on query change is accepted).

## Verification (actually ran)
- `pnpm --filter @easyerp/web typecheck` — clean.
- `pnpm verify` — 15/15 tasks successful (lint, typecheck, unit, build).
- `pnpm test:integration` — 11 files, 129 tests passed against real PostgreSQL.

## Strongest findings
- The repeated edit failures were a component-contract error, not whitespace:
  content was placed *inside* `<PageHeader>` which accepts no children.
- The page was an `async` server component using client hooks — split into
  server page + client list was the correct shape per ADR 0015.

## Unresolved / next
- Remaining list screens still unwired (parties, sales orders, invoices, credit
  notes, payments, stock, purchasing, production, BOMs, settings) — same
  server-page + client-list pattern applies.
- Contracts audit against ADRs/specs/CONTEXT.md still open.
- Theme switch and Setup→sign-in→app flow were verified working in a prior
  session (browser-tested); not re-verified this session.
