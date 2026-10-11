-- Credit Notes and Payments (ADR 0006, ADR 0010, ADR 0014, ADR 0016, ADR 0017).
--
-- ## A Credit Note is a priced Document that reverses an Issued Invoice
--
-- The reversal is line by line, so the link belongs on `document_line`, not on
-- a child table: a Credit Note line IS a priced line — same columns, same
-- immutability trigger — with a signed (negative) quantity and amounts. Its
-- `correctsDocumentLineId` points at the Invoice line being reversed, which is
-- what lets over-crediting be refused per line instead of per document.
--
-- The Credit Note's own type-specific fact is which Invoice it corrects. That
-- is the `credit_note` child (ADR 0014: "depth exactly one"), mirroring
-- `delivery_note`. Its immutability is guaranteed by the same
-- `easyerp_refuse_issued_child_mutation` trigger that guards `document_line`
-- and `document_tax_group`, attached here. (`delivery_note_line` remains the
-- one unguarded child — a known, documented gap in `docs/legacy-app-audit.md`;
-- the new tables deliberately do not reproduce it.)
--
-- ## Payments are money received against Documents, not Documents themselves
--
-- A Payment has no number, no status and no archive; it is a record of money
-- that arrived, and how much of it was assigned to which issued fiscal Document
-- via `payment_allocation`. An allocation to an Invoice settles part of the
-- Invoice; an allocation to a Credit Note is a refund paid out. Over-allocation
-- is refused by the application, under row locks on the target Documents, and
-- a `CHECK` here keeps a Payment or an allocation positive if it ever slips.
--
-- ## The sign convention
--
-- A Credit Note stores its figures signed (negative), because it is the
-- printed reversal: the customer's outstanding then is one additive sum over
-- the two `document` types, precisely the value ADR 0003 derives.

-- The reverse link. Deliberately nullable and untyped at the database level
-- (the two sides can be read as one query), constrained to a real line.
ALTER TABLE "document_line" ADD COLUMN "correctsDocumentLineId" TEXT;

-- CreateTable
CREATE TABLE "credit_note" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "correctsDocumentId" TEXT NOT NULL,

    CONSTRAINT "credit_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "amount" DECIMAL(18,3) NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL,
    "method" VARCHAR(32),
    "reference" VARCHAR(100),
    "note" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "amount" DECIMAL(18,3) NOT NULL,

    CONSTRAINT "payment_allocation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_allocation_paymentId_documentId_key" UNIQUE ("paymentId", "documentId")
);

-- CreateIndex
CREATE INDEX "document_line_correctsDocumentLineId_idx" ON "document_line"("correctsDocumentLineId");

-- CreateIndex
CREATE INDEX "credit_note_correctsDocumentId_idx" ON "credit_note"("correctsDocumentId");

-- CreateIndex
CREATE INDEX "payment_businessId_idx" ON "payment"("businessId");

-- CreateIndex
CREATE INDEX "payment_partyId_idx" ON "payment"("partyId");

-- CreateIndex
CREATE INDEX "payment_allocation_documentId_idx" ON "payment_allocation"("documentId");

-- AddForeignKey
ALTER TABLE "document_line" ADD CONSTRAINT "document_line_correctsDocumentLineId_fkey" FOREIGN KEY ("correctsDocumentLineId") REFERENCES "document_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note" ADD CONSTRAINT "credit_note_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note" ADD CONSTRAINT "credit_note_correctsDocumentId_fkey" FOREIGN KEY ("correctsDocumentId") REFERENCES "document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocation" ADD CONSTRAINT "payment_allocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocation" ADD CONSTRAINT "payment_allocation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A Payment of zero or negative is not a Payment; the application refuses it
-- before it reaches the database, and this stays true if the application ever
-- forgets. An allocation is the same fact, one level down.
ALTER TABLE "payment" ADD CONSTRAINT "payment_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "payment_allocation" ADD CONSTRAINT "payment_allocation_amount_positive" CHECK ("amount" > 0);

-- The Credit Note's type-specific row is immutable once its Document is Issued,
-- exactly like its lines and tax groups. The guard reads `documentId`, which
-- `credit_note` carries, so the shared function is reused rather than forked.
CREATE TRIGGER credit_note_refuse_issued_mutation
  BEFORE UPDATE OR DELETE ON credit_note
  FOR EACH ROW EXECUTE FUNCTION easyerp_refuse_issued_child_mutation();