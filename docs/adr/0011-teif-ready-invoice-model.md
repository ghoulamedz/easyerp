# The invoice model carries every field e-invoicing requires; transmission is a replaceable adapter

The Customer Invoice and Business settings carry every field the Tunisian e-invoicing format (TEIF) reads — issuer and recipient matricule fiscal, code activité, structured address, country and currency for exports, per-rate VAT breakdown, FODEC, timbre fiscal as a separate non-VAT line, retenue à la source as rate/base/amount, payment terms and RIB, and document type codes in the Number series — but the TEIF serializer, signature and transmission ship behind a `TeifAdapter` port with a no-op implementation, with actual transmission targeted at v1.1 through a third-party aggregator's REST API rather than the TTN protocol itself. Retrofitting those fields later would mean migrating invoices that already exist, which is why the data model is TEIF-shaped now even though the transmission is not. The version of the format churns and the legal timetable is unsettled, so committing to the protocol before a client needs it would be a guess.

## Consequences

- Each Business has an `E_INVOICING` setting of `OFF`, `PENDING` or `ON`, and the interface only surfaces transmission state when it is not `OFF`.
- With transmission on, issuing an invoice becomes a two-phase operation that can fail, so a Document can be `ISSUED · TRANSMISSION_FAILED` and retried. It is never renumbered and never deleted, which keeps ADR 0006's gapless invariant intact.
- The archived PDF is regenerated after signing, because the visible electronic seal (QR code) must be printed on it. ADR 0010's "render once" is really "render once per artifact lifecycle".
- Verify the timetable and the timbre fiscal and retenue à la source thresholds with an accountant before enabling `ON` for any client; vendor blogs disagree on all three, and the answer is stored as configuration rather than code.
