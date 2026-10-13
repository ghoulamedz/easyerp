# Tunisia Fiscal Build Plan (sequenced by dependency)

Source: `docs/tunisia-fiscal-research.md` (P1–P3 gaps). Read that file for evidence/confidence before building any item.
Non-goal (explicit): no "ICE" field — Morocco-only. Tunisia = matricule fiscal (MF).

## Build order (what must land before what)

### 0. Pricing core: FODEC-aware calculation order (foundation — first)
**Goal:** one canonical order — remise → FODEC 1% on HT net (line-level) → VAT base = HT + FODEC → TVA → TTC → timbre → RAS on TTC hors timbre → net à payer.
**Touchpoints:** `apps/api/src/finance/pricing.ts` (`priceLine`/`sumLines` + `FodecLineInput`), `apps/api/src/finance/amount.ts`, `apps/api/src/sales/price-document.ts` (`priceItems`, `totalsOf`, `repriceTotals`), `packages/contracts/src/documents.ts` (`orderLineSchema` + `documentTotalsSchema`: add `fodecAmount`).
**Migration:** none yet (pure function change), but freeze the formula in a comment citing research §2.
**Tests:** `apps/api/src/finance/__tests__/` (new `pricing-fodec.test.ts`: HT+FODEC base, multi-rate, rounding-once), existing `amount.test.ts`.
**Size:** M. **Accountant flag:** ⚠️ RAS base "hors timbre" is practice (note commune 12/2015), no express statute — confirm before locking.

### 1. FODEC support (P1)
**Goal:** per-Item `fodecSubject` flag; FODEC line before VAT; PDF + avoir carry FODEC.
**Touchpoints:** `packages/contracts/src/catalog.ts` (`itemSchema`/`itemInputSchema` + flag), `apps/api/src/catalog/*` (CRUD), `price-document.ts`, `customer-invoice.service.ts` + `credit-note.service.ts` (persist from stored figures), `finance/invoice-template.ts` + `invoice-document.ts` (FODEC row), TEIF payload (see §5).
**Migration:** `Item.fodecSubject Boolean @default(false)`; `DocumentLine.fodecAmount Decimal(18,3) @default(0)`; backfill existing rows to 0.
**Tests:** pricing unit (§0) + `customer-invoice.service` spec (issue with mixed fodec/non-fodec lines) + golden re-bless (`pnpm test:golden -- --update`, read the diff).
**Size:** M.

### 2. Timbre rules (P2 — needs §0 totals)
**Goal:** configurable amount (1.000 default; 1.500/2.000 grandes-surfaces tiers), exemption flag (export, EPA), "droit de timbre payé sur déclaration" + auth ref on PDF, out of VAT *and* RAS bases, timbre-on-avoir as a setting (default off).
**Touchpoints:** `packages/contracts/src/settings.ts` (new `fiscalSettings`: `stampDutyAmount`, `stampTier`, `stampExempt`, `stampDeclarationRef`, `stampOnCreditNote`), `apps/api/src/settings/*` (service + controller + backfill defaults), `invoice-template.ts`/`invoice-document.ts` (mention line), `customer-invoice.service.ts`/`credit-note.service.ts` (apply/exempt).
**Migration:** new `FiscalSettings` table or columns on `Business` (prefer table: `businessId` unique); `Document.stampExempt Boolean @default(false)`.
**Tests:** settings spec (validation, backfill), invoice-issue spec (tiers, exempt path, avoir default-off), golden (mention rendering fr/en/ar).
**Size:** M. **Accountant flag:** ⚠️ avoir-timbré-ou-non is unsettled — setting, never hard-code.

### 3. EXEMPT / suspension handling (P2 — needs §2 template slots)
**Goal:** regime fields — mention text, attestation number + date, suspended-VAT amount; block EXEMPT without attestation ref (warning vs hard block per accountant).
**Touchpoints:** `packages/contracts/src/documents.ts` (`vatRegime` stays; add `exemptionDetails` object on draft schemas), `customer-invoice.service.ts` (validate + persist), `finance/invoice-template.ts` `renderVatSection` (attestation + suspended amount), `finance/terminology.ts` (labels ×3 locales).
**Migration:** `Document.exemptionMention`, `exemptionAttestationNo/Date`, `suspendedVatAmount Decimal(18,3) nullable`.
**Tests:** invoice validation spec (EXEMPT-without-ref rejected), golden EXEMPT matrix already exists — extend with attestation fixture.
**Size:** S–M. **Accountant flag:** ⚠️ warning-vs-block and which activities qualify is a tax question — do not decide in code.

### 4. Retenue (RAS) display + certificates (P2 — needs §0–§2 bases)
**Goal:** footer shows RAS base (TTC hors timbre), rate, net à payer; store client RAS (TEJ) certificates; Outstanding falls only on certificate, never on hope.
**Touchpoints:** `finance/invoice-template.ts` + `invoice-document.ts` (RAS base/rate/net lines), `packages/contracts/src/payments.ts` (certificate schema), `apps/api/src/payments/payments.service.ts` + `payments.controller.ts` (certificate CRUD + allocation effect on `outstanding`), web invoice footer.
**Migration:** new `RasCertificate` table (`id`, `businessId`, `invoiceId FK`, `certificateNo`, `rate`, `amount Decimal(18,3)`, `issuedAt`); no change to `Payment` table.
**Tests:** payments spec (certificate reduces outstanding; missing cert does not), invoice-view spec (footer math), golden footer diff.
**Size:** M. **Accountant flag:** ⚠️ rates/thresholds (1 000 DT TTC; 1/0.5/1.5/3%) are regime-dependent — confirm table before coding.

### 5. El Fatoora / TEIF transmission adapter (P1 — consumingly last of the fiscal core; needs §1–§4)
**Goal:** replace no-op with TEIF XML (UN/EDIFACT INVOIC) emit + TTN ref/QR storage; retry on `TRANSMISSION_FAILED` never renumbers; keep timbre (TEIF I-1601); surface "stamped paper copy with TTN ref" for goods transport; couvre facture + avoir (I-12) + note d'honoraires.
**Touchpoints:** new `apps/api/src/einvoicing/` module (builder `teif.ts`, `ttn.client.ts`, `signature` via TunTrust, retry worker), `Document` e-invoicing columns, `packages/contracts/src/documents.ts` (`EINVOICING_STATES` already exists — extend payload types), `invoice-template.ts` (QR + TTN ref block), transport-copy notice (delivery-note screen).
**Migration:** `Document.eInvoicingState` (already implied by contract — materialize), `teifRef`, `teifQr`, `ttnSignature`, `transmittedAt` nullable columns.
**Tests:** contract tests (golden TEIF fixtures incl. FODEC I-lines + timbre I-1601 + avoir I-12), adapter fake-TTN integration spec (fail → `TRANSMISSION_FAILED` → retry → `ACCEPTED`, number stable), no-network unit default.
**Size:** L. **Accountant flag:** ⚠️⚠️ LF 2026 services calendar + April-2026 deferral proposal + note commune 02/2026 are time-sensitive — re-check JORT/DGI before committing scope; paper-instead-of-electronic fines (100–500 DT) set urgency, not design.

### 6. MF discipline (P3 — parallelizable anytime after §0; placed here to avoid blocking fiscal core)
**Goal:** validate MF format at Party creation (incl. 13-char TEIF form `1234567X/A/M/000` without slashes); require client MF when client is declarant; CIN for particuliers.
**Touchpoints:** `packages/contracts/src/catalog.ts` (`partySchema`/`partyInputSchema`: `taxIdentifier` regex + `idDocType: MF|CIN`), `apps/api/src/parties/party.service.ts` (validate + declarant-required rule), `packages/contracts/src/setup.ts` + `settings.ts` (business MF same rule), onboarding screens.
**Migration:** none (validation only) unless storing `idDocType` — then `Party.idDocType VarChar(8) @default("MF")`.
**Tests:** contract zod spec (valid/invalid MF, CIN path), party service spec (declarant-without-MF rejected).
**Size:** S.

### 7. Archive durability (P3 — after PDFs stabilize in §1–§4)
**Goal:** 10-year probative archive: one-click fiscal-year export (PDFs + SHA-256 + index), scheduled integrity check, documented restore; never tie lifetime to container disk.
**Touchpoints:** `apps/api/src/sales/document-archive.ts` (export + `verify`), new `archive.controller.ts` (export endpoint, permission-gated), `apps/api/src/finance/golden.ts` (hash manifest), ops docs (backup/restore runbook).
**Migration:** optional `ArchiveVerification` log table (`ranAt`, `checked`, `failures`); archive stays on disk + export artifact.
**Tests:** archive spec (export manifest matches files; tampered file fails verify), permission spec (export gated).
**Size:** M.

### 8. Re-pricing audit + return linkage (P3 — last, UX-heavy)
**Goal:** record price source per line (catalog vs order vs manual); on return-type avoirs require/link the `RETURN_IN` ledger entry (ADR 0017 stays: avoir never moves stock).
**Touchpoints:** `packages/contracts/src/documents.ts` (`priceSource` enum on line schemas), `price-document.ts` (stamp source), `credit-note.service.ts` (return-type requires `returnEntryId`), `apps/api/src/inventory/*` (lookup/link), credit-note + receipt screens.
**Migration:** `DocumentLine.priceSource VarChar(16) @default("CATALOG")`; `CreditNote.returnLedgerEntryId nullable FK`.
**Tests:** issue spec (source recorded), credit-note spec (return-type without entry rejected), inventory link spec.
**Size:** S–M.

## Dependency graph (one line)
§0 pricing formula → §1 FODEC + §2 timbre (parallel) → §3 exempt + §4 RAS (parallel, consume §0–§2) → §5 TEIF adapter (consumes all fiscal fields) → §7 archive (after PDFs final); §6 MF + §8 audit ride parallel anytime.

## Test gates per change (global)
`pnpm verify` (lint/typecheck/unit/build) → `pnpm test:integration` (real PG + real `AppModule`; mandatory for module/provider/guard changes) → `pnpm test:golden -- --update` + read diff (any template change) → web e2e for new screens. Money/stock/numbering/Issued changes additionally need a would-have-failed-before test; concurrency needs two-writer coverage.
