-- Catalog and Customer Invoice (ADR 0005, ADR 0006, ADR 0010, ADR 0011).
--
-- Field names here are the ones in `packages/contracts`. `itemSchema`, `partySchema`,
-- `orderLineSchema` and `documentTotalsSchema` are the source of truth for this
-- shape; a column called `netTotal` while the contract says `netAmount` would make
-- every mapper in the codebase a translation layer, and one of them would be wrong.
--
-- Three tables, because the per-rate breakdown is not a rendering detail: the
-- figures a document prints have to survive the row that produced them.

-- NOT "DROP INDEX custom_record_values_gin_idx", which is what `prisma migrate diff`
-- generated here and what the Custom Record index test caught. Prisma's datamodel
-- cannot express a GIN index over a JsonB column, so diffing the migrations
-- directory against the datamodel sees an index the schema does not mention and
-- concludes it should go. It is created by raw SQL in the previous migration and
-- `schema.spec.ts` asserts it exists and that the planner reaches for it. Do not let
-- a regenerated diff reintroduce the drop.

-- CreateTable
CREATE TABLE "item" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" VARCHAR(2000),
    "itemType" VARCHAR(32) NOT NULL,
    "baseUnitId" TEXT NOT NULL,
    "purchaseUnitId" TEXT,
    "saleUnitId" TEXT,
    "taxRateId" TEXT NOT NULL,
    "salePrice" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "purchasePrice" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "reorderPoint" DECIMAL(18,3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "party" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "taxIdentifier" VARCHAR(32),
    "email" VARCHAR(320),
    "phone" VARCHAR(32),
    "address" VARCHAR(500),
    "city" VARCHAR(120),
    "countryCode" CHAR(2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_invoice" (
    "id" TEXT NOT NULL,
    "type" VARCHAR(32) NOT NULL DEFAULT 'CUSTOMER_INVOICE',
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

    CONSTRAINT "customer_invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_invoice_line" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
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

    CONSTRAINT "customer_invoice_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_invoice_tax_group" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "rate" DECIMAL(5,3) NOT NULL,
    "base" DECIMAL(18,3) NOT NULL,
    "amount" DECIMAL(18,3) NOT NULL,

    CONSTRAINT "customer_invoice_tax_group_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "item_code_key" ON "item"("code");

-- CreateIndex
CREATE INDEX "item_itemType_isActive_idx" ON "item"("itemType", "isActive");

-- CreateIndex
CREATE INDEX "item_taxRateId_idx" ON "item"("taxRateId");

-- CreateIndex
CREATE UNIQUE INDEX "party_code_key" ON "party"("code");

-- CreateIndex
CREATE UNIQUE INDEX "party_taxIdentifier_key" ON "party"("taxIdentifier");

-- CreateIndex
CREATE INDEX "party_roles_idx" ON "party"("roles");

-- CreateIndex
CREATE INDEX "party_isActive_idx" ON "party"("isActive");

-- CreateIndex
CREATE INDEX "customer_invoice_businessId_status_issuedAt_idx" ON "customer_invoice"("businessId", "status", "issuedAt");

-- CreateIndex
CREATE INDEX "customer_invoice_partyId_idx" ON "customer_invoice"("partyId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_invoice_businessId_number_key" ON "customer_invoice"("businessId", "number");

-- CreateIndex
CREATE INDEX "customer_invoice_line_itemId_idx" ON "customer_invoice_line"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_invoice_line_invoiceId_position_key" ON "customer_invoice_line"("invoiceId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "customer_invoice_tax_group_invoiceId_position_key" ON "customer_invoice_tax_group"("invoiceId", "position");

-- AddForeignKey
ALTER TABLE "item" ADD CONSTRAINT "item_baseUnitId_fkey" FOREIGN KEY ("baseUnitId") REFERENCES "unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item" ADD CONSTRAINT "item_purchaseUnitId_fkey" FOREIGN KEY ("purchaseUnitId") REFERENCES "unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item" ADD CONSTRAINT "item_saleUnitId_fkey" FOREIGN KEY ("saleUnitId") REFERENCES "unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item" ADD CONSTRAINT "item_taxRateId_fkey" FOREIGN KEY ("taxRateId") REFERENCES "tax_rate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_invoice" ADD CONSTRAINT "customer_invoice_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_invoice" ADD CONSTRAINT "customer_invoice_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_invoice_line" ADD CONSTRAINT "customer_invoice_line_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "customer_invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_invoice_line" ADD CONSTRAINT "customer_invoice_line_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_invoice_tax_group" ADD CONSTRAINT "customer_invoice_tax_group_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "customer_invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Issued documents are immutable (ADR 0006)
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
       OR NEW.status IS DISTINCT FROM OLD.status
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
       OR NEW."stampDutyAmount" IS DISTINCT FROM OLD."stampDutyAmount" THEN
      RAISE EXCEPTION
        'An issued document is immutable (document %, number %); correct it with a Credit Note',
        OLD.id, OLD.number;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customer_invoice_refuse_issued_mutation
  BEFORE UPDATE OR DELETE ON customer_invoice
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
    parent_id := OLD."invoiceId";
  ELSE
    parent_id := NEW."invoiceId";
  END IF;

  SELECT status INTO parent_status FROM customer_invoice WHERE id = parent_id;

  IF parent_status = 'ISSUED' THEN
    RAISE EXCEPTION
      'An issued document is immutable (document %, table %); correct it with a Credit Note',
      parent_id, TG_TABLE_NAME;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customer_invoice_line_refuse_issued_mutation
  BEFORE UPDATE OR DELETE ON customer_invoice_line
  FOR EACH ROW EXECUTE FUNCTION easyerp_refuse_issued_child_mutation();

CREATE TRIGGER customer_invoice_tax_group_refuse_issued_mutation
  BEFORE UPDATE OR DELETE ON customer_invoice_tax_group
  FOR EACH ROW EXECUTE FUNCTION easyerp_refuse_issued_child_mutation();
