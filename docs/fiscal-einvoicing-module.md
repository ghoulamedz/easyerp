# Fiscal E-Invoicing as a Configurable Module (refines `docs/fiscal-build-plan.md` §5)

Grounding: `docs/tunisia-fiscal-research.md` §5 (El Fatoora: TEIF XML INVOIC, TunTrust signature,
TTN ref + QR + TTN signature; covers facture, avoir I-12, note d'honoraires; timbre kept via I-1601;
paper tolerated transitionally), `docs/scout-architecture-overview.md` §3 (modules, setup, ADR 0011).
Code today: `MODULES`/`moduleCodeSchema`/`MODULE_BY_DOCUMENT_TYPE` (`packages/contracts/src/settings.ts`);
`ModuleStateService` absent-row-reads-enabled + `ModulesGuard`/`RequiresModule`
(`apps/api/src/settings/`); Setup checkboxes + `SetupRequest.modules`
(`apps/web/src/components/setup-screen.tsx`, `packages/contracts/src/setup.ts`,
`apps/api/src/setup/setup.service.ts`); issue → number → render → `archivePdf` → record
path/hash (`apps/api/src/sales/customer-invoice.service.ts`, `finance/invoice-template.ts`,
`finance/invoice-document.ts`, `sales/document-archive.ts`).

## 1. Add `E_INVOICING` to the module catalog — default OFF
- `packages/contracts/src/settings.ts`: append `'E_INVOICING'` to `MODULES`. Do NOT add it to
  `MODULE_BY_DOCUMENT_TYPE` (no document type belongs to it; `CUSTOMER_INVOICE`/`CREDIT_NOTE` stay
  `FINANCE`) — it is a cross-cutting fiscal capability, not a document owner.
- `apps/api/prisma/schema.prisma` `ModuleState.module`: no schema change needed (string code);
  add migration backfill rows (see §4).
- `apps/api/src/setup/setup.service.ts` + `setup.ts` `setupRequestSchema`: accept the new code
  automatically via `moduleCodeSchema`; extend `defaultModules` with `E_INVOICING: false`.
- `apps/web/src/components/setup-screen.tsx`: add checkbox, unchecked by default (same pattern as
  `PRODUCTION`). Settings modules screen must list it with enable/disable via `ModuleStateService.set`
  (audit `module.enabled/disabled` already covers it).
- New `apps/api/src/einvoicing/` module: `teif.builder.ts` (payload from stored figures),
  `ttn.client.ts` (transmit), signature via TunTrust, retry path. Guard its controller with
  `@RequiresModule('E_INVOICING')`; do NOT put `RequiresModule('E_INVOICING')` on invoice issue —
  issue must work with the module OFF.
- **Default OFF, reasoning:** absent-row-reads-enabled means merely adding the code silently enables
  it for existing businesses; with a no-op/immature TTN adapter, default-ON would gate or mutate every
  invoice issue. OFF keeps today's flow byte-identical until a Business opts in; matches `PRODUCTION`
  precedent (lean-start default false) and LF-2026 flux (research: re-check JORT/DGI before locking scope).

## 2. Behavior matrix
| | E_INVOICING OFF | E_INVOICING ON |
|---|---|---|
| `draft → issue → number → print` | identical to today; same numbers, same printed figures | identical numbering; transmission is a post-commit side effect |
| TEIF/TTN calls | none; no network, no new required fields | after `archivePdf`: build TEIF from stored figures → transmit → persist result |
| Stored refs | no new columns written | `eInvoicingState`, `teifRef`, `teifQr`, `ttnSignature`, `transmittedAt` |
| Failure | n/a | `TRANSMISSION_FAILED`: number + archive stand; retry endpoint re-transmits only |
| Retry | n/a | explicit retry route (`@RequiresModule('E_INVOICING')`); never renumbers, never re-archives over (`wx`) |
| Credit notes | unchanged | avoir transmitted with I-12 coding; same retry rule |
| printed paper | unchanged figures | QR + TTN-ref block renders only when `ACCEPTED` data exists (otherwise the paper is unchanged) |

## 3. Conditional vs unconditional in code
- Conditional (only when module enabled): TEIF build/transmit/persist; retry endpoint; QR/TTN-ref PDF
  block; transport-copy "stamped paper copy with TTN ref" notice; any new required-field validation
  (e.g. recipient MF completeness for TEIF).
- Unconditional: numbering, immutability triggers, archive `wx` + sha256, pricing/FODEC/timbre/RAS
  work (§0–§4 feed the TEIF payload but ship independently); `EINVOICING_STATES` contract stays.
- Adapter interface unconditional in shape (replaceable/no-op default), conditional in invocation —
  issue path calls it only when `ModuleStateService.isEnabled('E_INVOICING')`.

## 4. Migration / backfill
- Prisma: add nullable `Document.eInvoicingState` (default `'OFF'`), `teifRef`, `teifQr`,
  `ttnSignature`, `transmittedAt`; extend immutability triggers to allow only these (+ archive cols)
  post-issue writes. (Note: contract `EINVOICING_STATES` exists but columns do not — materialize here.)
- Backfill: insert `ModuleState { module: 'E_INVOICING', isEnabled: false }` for every existing
  business (explicit row defeats absent-means-enabled); existing documents keep `eInvoicingState='OFF'`.
- No re-numbering, no re-archiving, no PDF rewrite for history. Opt-in per Business thereafter.

## 5. Test gates per item
- `§1` catalog: settings spec (new code listed, toggle flips next request via `ModulesGuard`),
  setup spec (default false persisted); gates: `pnpm verify` + `pnpm test:integration` (mandatory —
  module/provider/guard change boots real `AppModule`).
- `§2` OFF: the print consistency tests are unchanged (no template or figure moves);
  no-network assertion (fake TTN unreachable + module OFF → issue still `ISSUED`, no state write).
- `§2` ON: fake-TTN integration spec — fail → `TRANSMISSION_FAILED` → retry → `ACCEPTED`, number
  stable across retries; would-have-failed-before test (retry renumbering attempt refused).
- `§3` template: the QR/TTN block is asserted per locale for ACCEPTED fixtures, and asserted absent otherwise
  (the sealed print copy reads the new reference off the row); every printed figure is otherwise identical.
- `§4` migration: backfill spec (pre-existing business reads disabled; old docs `OFF`/null refs);
  trigger spec (post-issue TEIF-col write allowed, figure rewrite still refused).
- Global: `pnpm verify` (includes the print consistency tests) → `pnpm test:integration` → web e2e for setup/settings screens.
