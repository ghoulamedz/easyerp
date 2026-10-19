# The invoice model carries every field e-invoicing requires; transmission is a replaceable adapter

The Customer Invoice and Business settings carry every field the Tunisian e-invoicing format (TEIF) reads — issuer and recipient matricule fiscal, code activité, structured address, country and currency for exports, per-rate VAT breakdown, FODEC, timbre fiscal as a separate non-VAT line, retenue à la source as rate/base/amount, payment terms and RIB, and document type codes in the Number series — but the TEIF serializer, signature and transmission ship behind a `TeifAdapter` port with a no-op implementation, with actual transmission targeted at v1.1 through a third-party aggregator's REST API rather than the TTN protocol itself. Retrofitting those fields later would mean migrating invoices that already exist, which is why the data model is TEIF-shaped now even though the transmission is not. The version of the format churns and the legal timetable is unsettled, so committing to the protocol before a client needs it would be a guess.

## Consequences

- Each Business has an `E_INVOICING` setting of `OFF`, `PENDING` or `ON`, and the interface only surfaces transmission state when it is not `OFF`.
- With transmission on, issuing an invoice becomes a two-phase operation that can fail, so a Document can be `ISSUED · TRANSMISSION_FAILED` and retried. It is never renumbered and never deleted, which keeps ADR 0006's gapless invariant intact.
- The archived PDF is regenerated after signing, because the visible electronic seal (QR code) must be printed on it. ADR 0010's "render once" is really "render once per artifact lifecycle".
- Verify the timetable and the timbre fiscal and retenue à la source thresholds with an accountant before enabling `ON` for any client; vendor blogs disagree on all three, and the answer is stored as configuration rather than code.

## Amendment: the printed A4 is the legal artifact, and TEIF's own artifact is XML

This ADR said the archived PDF is regenerated after signing so the visible seal (QR code) prints on it. That was true as a description of the implementation and wrong about what the artifact *is*, in two ways.

**The legal object is the printed A4 page.** Tunisian practice for the businesses this product serves is a physical paper, signed and filed; the tamper-evident e-invoice (El Fatoota/TEIF) is a separate regime with a separate artifact. What the server must therefore guarantee is that the paper it prints is the paper that was issued — consistent, reproducible from stored rows, in the customer's language — not that a particular file format was written to disk.

**The TEIF artifact is XML.** Per the research this repository already holds (`docs/tunisia-fiscal-research.md`), an e-invoice is UN/EDIFACT `INVOIC` with a qualified signature and a TTN reference, and a PDF emailed to a customer is explicitly *not* it. So the PDF was never the fiscal artifact; it was a human-readable rendering of one, and a rendering that a browser can produce equally well.

What follows, and what replaces the PDF clause:

- **The filed copy is the print copy** — self-contained HTML, rendered once at issue, served by `GET <paper>/:id/print`, printed by the visitor's browser in A4 (ADR 0010, amendment). It is what "consistent" is measured against, and it is gated byte for byte in `pnpm verify`.
- **The seal still forces a second filing.** When TEIF lands, the QR and the TTN reference must appear on the paper the customer receives, so the print copy is re-rendered and re-filed after signing. This ADR's "render once per artifact lifecycle" survives exactly as written; only the artifact's format changed from a PDF to the print copy.
- **A PDF is optional, and its absence is not a compliance gap.** Where a deployment has a browser it may still file one; a deployment without one is not withholding anything the law asks for. That is why `ARCHIVE_UNAVAILABLE` is a fair answer for the PDF while Print always works.
