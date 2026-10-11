/*
  Warnings:

  - You are about to move `customer_invoice` into the generic `document` table
    (ADR 0014): every Document type — Customer Invoice today, Sales Order and
    Delivery Note from this migration, Credit Note later — shares one table, one
    line table and one tax-group table, discriminated by `type`.

*/

-- The trigram indexes at the bottom of this migration (and in
-- `20261006140000_catalog_crud_party_terms`) need pg_trgm. A fresh database that
-- only replays the migrations must not depend on host init scripts, so the
-- extension is requested here, before its first use.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- DropForeignKey on the tables being moved. Kept before the table drop so the
-- move never leaves a table whose constraints reference nothing.
ALTER TABLE "customer_invoice" DROP CONSTRAINT "customer_invoice_businessId_fkey";

ALTER TABLE "customer_invoice" DROP CONSTRAINT "customer_invoice_partyId_fkey";

ALTER TABLE "customer_invoice_line" DROP CONSTRAINT "customer_invoice_line_invoiceId_fkey";

ALTER TABLE "customer_invoice_line" DROP CONSTRAINT "customer_invoice_line_itemId_fkey";

ALTER TABLE "customer_invoice_tax_group" DROP CONSTRAINT "customer_invoice_tax_group_invoiceId_fkey";

-- AlterTable
ALTER TABLE "business" ADD COLUMN     "backorderPolicy" VARCHAR(16) NOT NULL DEFAULT 'STRICT';

-- CreateTable
CREATE TABLE "document" (
    "id" TEXT NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    "number" VARCHAR(64),
    "issuedAt" TIMESTAMPTZ(3),
    "businessId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "vatRegime" VARCHAR(16) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "netAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "grossAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "withholdingTaxAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "stampDutyAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "archivePath" VARCHAR(500),
    "archivedAt" TIMESTAMPTZ(3),
    "archiveSha256" CHAR(64),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_line" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "itemId" TEXT NOT NULL,
    "unitOfMeasureId" TEXT NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(18,3) NOT NULL,
    "taxRate" DECIMAL(5,3) NOT NULL,
    "netAmount" DECIMAL(18,3) NOT NULL,
    "taxAmount" DECIMAL(18,3) NOT NULL,
    "grossAmount" DECIMAL(18,3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "document_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_tax_group" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "rate" DECIMAL(5,3) NOT NULL,
    "base" DECIMAL(18,3) NOT NULL,
    "amount" DECIMAL(18,3) NOT NULL,

    CONSTRAINT "document_tax_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "salesOrderLineId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "deliveredQuantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "releasedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_ledger_entry" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "itemId" TEXT NOT NULL,
    "reason" VARCHAR(32) NOT NULL,
    "direction" VARCHAR(8) NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "balanceBefore" DECIMAL(18,3) NOT NULL,
    "balanceAfter" DECIMAL(18,3) NOT NULL,
    "documentType" VARCHAR(32),
    "documentId" VARCHAR(191),
    "reasonText" VARCHAR(500),
    "reversesEntryId" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" VARCHAR(191),

    CONSTRAINT "stock_ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_note" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "salesOrderId" TEXT,

    CONSTRAINT "delivery_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_note_line" (
    "id" TEXT NOT NULL,
    "deliveryNoteId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "itemId" TEXT NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitOfMeasureId" TEXT NOT NULL,
    "salesOrderLineId" TEXT,

    CONSTRAINT "delivery_note_line_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Carry the existing Customer Invoices into the generic tables (ADR 0014),
-- preserving ids so history, references and triggers keep working.
-- ---------------------------------------------------------------------------

INSERT INTO "document"
  ("id", "type", "status", "number", "issuedAt", "businessId", "partyId",
   "locale", "vatRegime", "currency", "netAmount", "taxAmount", "grossAmount",
   "withholdingTaxAmount", "stampDutyAmount", "archivePath", "archivedAt",
   "archiveSha256", "createdAt", "updatedAt")
SELECT
  "id", 'CUSTOMER_INVOICE', "status", "number", "issuedAt", "businessId",
  "partyId", "locale", "vatRegime", "currency", "netAmount", "taxAmount",
  "grossAmount", "withholdingTaxAmount", "stampDutyAmount", "archivePath",
  "archivedAt", "archiveSha256", "createdAt", "updatedAt"
FROM "customer_invoice";

INSERT INTO "document_line"
  ("id", "documentId", "position", "itemId", "unitOfMeasureId", "description",
   "quantity", "unitPrice", "taxRate", "netAmount", "taxAmount", "grossAmount",
   "createdAt", "updatedAt")
SELECT
  "id", "invoiceId", "position", "itemId", "unitOfMeasureId", "description",
  "quantity", "unitPrice", "taxRate", "netAmount", "taxAmount", "grossAmount",
  "createdAt", "updatedAt"
FROM "customer_invoice_line";

INSERT INTO "document_tax_group"
  ("id", "documentId", "position", "rate", "base", "amount")
SELECT
  "id", "invoiceId", "position", "rate", "base", "amount"
FROM "customer_invoice_tax_group";

-- DropTable
DROP TABLE "customer_invoice_tax_group";

DROP TABLE "customer_invoice_line";

DROP TABLE "customer_invoice";

-- CreateIndex
CREATE INDEX "document_businessId_type_status_issuedAt_idx" ON "document"("businessId", "type", "status", "issuedAt");

CREATE INDEX "document_type_status_idx" ON "document"("type", "status");

CREATE INDEX "document_partyId_idx" ON "document"("partyId");

CREATE UNIQUE INDEX "document_businessId_number_key" ON "document"("businessId", "number");

CREATE INDEX "document_line_itemId_idx" ON "document_line"("itemId");

CREATE UNIQUE INDEX "document_line_documentId_position_key" ON "document_line"("documentId", "position");

CREATE UNIQUE INDEX "document_tax_group_documentId_position_key" ON "document_tax_group"("documentId", "position");

CREATE INDEX "reservation_itemId_releasedAt_idx" ON "reservation"("itemId", "releasedAt");

CREATE INDEX "reservation_salesOrderId_idx" ON "reservation"("salesOrderId");

CREATE INDEX "stock_ledger_entry_itemId_seq_idx" ON "stock_ledger_entry"("itemId", "seq");

CREATE INDEX "stock_ledger_entry_documentType_documentId_idx" ON "stock_ledger_entry"("documentType", "documentId");

CREATE UNIQUE INDEX "stock_ledger_entry_id_seq_key" ON "stock_ledger_entry"("id", "seq");

CREATE UNIQUE INDEX "delivery_note_documentId_key" ON "delivery_note"("documentId");

CREATE INDEX "delivery_note_line_salesOrderLineId_idx" ON "delivery_note_line"("salesOrderLineId");

CREATE UNIQUE INDEX "delivery_note_line_deliveryNoteId_position_key" ON "delivery_note_line"("deliveryNoteId", "position");

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "document" ADD CONSTRAINT "document_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "document_line" ADD CONSTRAINT "document_line_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_line" ADD CONSTRAINT "document_line_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "document_tax_group" ADD CONSTRAINT "document_tax_group_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reservation" ADD CONSTRAINT "reservation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reservation" ADD CONSTRAINT "reservation_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reservation" ADD CONSTRAINT "reservation_salesOrderLineId_fkey" FOREIGN KEY ("salesOrderLineId") REFERENCES "document_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_ledger_entry" ADD CONSTRAINT "stock_ledger_entry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_ledger_entry" ADD CONSTRAINT "stock_ledger_entry_reversesEntryId_fkey" FOREIGN KEY ("reversesEntryId") REFERENCES "stock_ledger_entry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "delivery_note" ADD CONSTRAINT "delivery_note_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "delivery_note" ADD CONSTRAINT "delivery_note_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "delivery_note_line" ADD CONSTRAINT "delivery_note_line_deliveryNoteId_fkey" FOREIGN KEY ("deliveryNoteId") REFERENCES "delivery_note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "delivery_note_line" ADD CONSTRAINT "delivery_note_line_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "delivery_note_line" ADD CONSTRAINT "delivery_note_line_salesOrderLineId_fkey" FOREIGN KEY ("salesOrderLineId") REFERENCES "document_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Issued documents are immutable (ADR 0006), now across every document type.
-- ---------------------------------------------------------------------------
--
-- Enforced in the database as well as in the service, because the service is one
-- of several ways in: a migration, a psql session, or a future endpoint all reach
-- the table without passing through TypeScript.
--
-- `RAISE EXCEPTION` with no ERRCODE, deliberately. `restrict_violation` is the
-- semantically tidier choice and it is the wrong one: Prisma maps SQLSTATE 23001 to
-- P2003 "Foreign key constraint violated", so an operator reading a log sees a
-- constraint failure and goes looking for a bad foreign key instead of reading the
-- message, which the driver has buried in meta. The default SQLSTATE keeps the
-- sentence where it can be read.
--
-- The trigger compares every content column rather than raising on any update, so
-- the three archive columns stay writable. That is deliberate and is the one
-- concession: the transaction that issues a document must commit before its PDF
-- can be written, because the file name is the document number. The consequence is
-- a small, explicit window in which a document has a number and no archived file.
-- `archivedAt` is nullable so that window is representable and therefore
-- detectable, and every figure the PDF needs is stored on the row, so the file is
-- regenerable rather than lost.

CREATE OR REPLACE FUNCTION easyerp_refuse_issued_document_mutation() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'ISSUED' THEN
    IF NEW.type IS DISTINCT FROM OLD.type
       OR NEW.number IS DISTINCT FROM OLD.number
       OR NEW."issuedAt" IS DISTINCT FROM OLD."issuedAt"
       OR NEW."businessId" IS DISTINCT FROM OLD."businessId"
       OR NEW."partyId" IS DISTINCT FROM OLD."partyId"
       OR NEW.locale IS DISTINCT FROM OLD.locale
       OR NEW."vatRegime" IS DISTINCT FROM OLD."vatRegime"
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW."netAmount" IS DISTINCT FROM OLD."netAmount"
       OR NEW."taxAmount" IS DISTINCT FROM OLD."taxAmount"
       OR NEW."grossAmount" IS DISTINCT FROM OLD."grossAmount"
       OR NEW."withholdingTaxAmount" IS DISTINCT FROM OLD."withholdingTaxAmount"
       OR NEW."stampDutyAmount" IS DISTINCT FROM OLD."stampDutyAmount"
       OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'CANCELLED') THEN
      RAISE EXCEPTION
        'An issued document is immutable (document %, number %); correct it with a Credit Note',
        OLD.id, OLD.number;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER document_refuse_issued_mutation
  BEFORE UPDATE OR DELETE ON document
  FOR EACH ROW EXECUTE FUNCTION easyerp_refuse_issued_document_mutation();

-- A guard on the parent row alone would leave the lines editable, and the lines
-- carry every figure the document shows. Guarding the parent while its children
-- stay writable would be an immutability claim that a single UPDATE disproves.
CREATE OR REPLACE FUNCTION easyerp_refuse_issued_child_mutation() RETURNS trigger AS $$
DECLARE
  parent_status text;
  parent_id     text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    parent_id := OLD."documentId";
  ELSE
    parent_id := NEW."documentId";
  END IF;

  SELECT status INTO parent_status FROM document WHERE id = parent_id;

  IF parent_status = 'ISSUED' THEN
    RAISE EXCEPTION
      'An issued document is immutable (document %, table %); correct it with a Credit Note',
      parent_id, TG_TABLE_NAME;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER document_line_refuse_issued_mutation
  BEFORE UPDATE OR DELETE ON document_line
  FOR EACH ROW EXECUTE FUNCTION easyerp_refuse_issued_child_mutation();

CREATE TRIGGER document_tax_group_refuse_issued_mutation
  BEFORE UPDATE OR DELETE ON document_tax_group
  FOR EACH ROW EXECUTE FUNCTION easyerp_refuse_issued_child_mutation();

-- The same immutability holds a Reservation attached to an Issued Sales Order:
-- short of a Reversal this is history. `quantity` is immutable while the order
-- is Issued; the corrective path is a Delivery Note or a Reversal, not an edit.
CREATE OR REPLACE FUNCTION easyerp_refuse_issued_reservation_mutation() RETURNS trigger AS $$
DECLARE
  order_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    order_status := NULL;
  ELSE
    SELECT status INTO order_status FROM document WHERE id = NEW."salesOrderId";
    IF order_status = 'ISSUED' AND (NEW."quantity" != OLD."quantity") THEN
      RAISE EXCEPTION 'A reservation on an Issued Sales Order is immutable (reservation %); correct it with a Reversal', OLD.id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reservation_refuse_issued_mutation
  BEFORE UPDATE ON reservation
  FOR EACH ROW EXECUTE FUNCTION easyerp_refuse_issued_reservation_mutation();

-- ---------------------------------------------------------------------------
-- Raw-SQL indexes carried by hand. `prisma migrate dev` diffs the schema it can
-- see and keeps emitting DROP INDEX for these, because it never learned they
-- were created in the item/party migrations; they protect the search-as-you-type
-- endpoints (ADR 0006) and are re-asserted here without losing the data.
-- ---------------------------------------------------------------------------
DO $for$ BEGIN
  CREATE INDEX IF NOT EXISTS custom_record_values_gin_idx
    ON "custom_record" USING GIN (("values" -> 'value') jsonb_path_ops);
  CREATE INDEX IF NOT EXISTS item_code_trgm_idx
    ON "item" USING GIN (("code") gin_trgm_ops);
  CREATE INDEX IF NOT EXISTS item_name_trgm_idx
    ON "item" USING GIN (("name") gin_trgm_ops);
  CREATE INDEX IF NOT EXISTS party_code_trgm_idx
    ON "party" USING GIN (("code") gin_trgm_ops);
  CREATE INDEX IF NOT EXISTS party_name_trgm_idx
    ON "party" USING GIN (("name") gin_trgm_ops);
END $for$;