-- Reconcile schema drift: tables and columns the services already use
-- but no migration ever created (purchase/production/BOM companions,
-- payment unallocatedCredit/position). Trigram search indexes from
-- 20261006140000 are intentionally NOT dropped: Prisma cannot express
-- GIN indexes, so diff always flags them; story 32 depends on them.

-- AlterTable
ALTER TABLE "payment" ADD COLUMN     "unallocatedCredit" DECIMAL(18,3) NOT NULL;
-- AlterTable
ALTER TABLE "payment_allocation" ADD COLUMN     "position" INTEGER NOT NULL;
-- CreateTable
CREATE TABLE "purchase_order" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "partyId" TEXT,
    CONSTRAINT "purchase_order_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "purchase_order_line" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "itemId" TEXT NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitOfMeasureId" TEXT NOT NULL,
    CONSTRAINT "purchase_order_line_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "goods_receipt" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "partyId" TEXT,
    CONSTRAINT "goods_receipt_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "goods_receipt_line" (
    "id" TEXT NOT NULL,
    "goodsReceiptId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "itemId" TEXT NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitOfMeasureId" TEXT NOT NULL,
    "purchaseOrderLineId" TEXT,
    CONSTRAINT "goods_receipt_line_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "discrepancy" (
    "id" TEXT NOT NULL,
    "documentType" VARCHAR(32) NOT NULL,
    "documentId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "expectedQuantity" DECIMAL(18,3) NOT NULL,
    "actualQuantity" DECIMAL(18,3) NOT NULL,
    "direction" VARCHAR(16) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "discrepancy_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "bom" (
    "id" TEXT NOT NULL,
    "finishedItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "bom_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "bom_version" (
    "id" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bom_version_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "bom_version_line" (
    "id" TEXT NOT NULL,
    "bomVersionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitOfMeasureId" TEXT NOT NULL,
    CONSTRAINT "bom_version_line_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "production_order" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "bomVersionId" TEXT NOT NULL,
    CONSTRAINT "production_order_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "production_order_line" (
    "id" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "itemId" TEXT NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitOfMeasureId" TEXT NOT NULL,
    CONSTRAINT "production_order_line_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_documentId_key" ON "purchase_order"("documentId");
-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_line_purchaseOrderId_position_key" ON "purchase_order_line"("purchaseOrderId", "position");
-- CreateIndex
CREATE UNIQUE INDEX "goods_receipt_documentId_key" ON "goods_receipt"("documentId");
-- CreateIndex
CREATE INDEX "goods_receipt_line_purchaseOrderLineId_idx" ON "goods_receipt_line"("purchaseOrderLineId");
-- CreateIndex
CREATE UNIQUE INDEX "goods_receipt_line_goodsReceiptId_position_key" ON "goods_receipt_line"("goodsReceiptId", "position");
-- CreateIndex
CREATE INDEX "discrepancy_documentType_documentId_idx" ON "discrepancy"("documentType", "documentId");
-- CreateIndex
CREATE UNIQUE INDEX "discrepancy_documentType_documentId_lineId_key" ON "discrepancy"("documentType", "documentId", "lineId");
-- CreateIndex
CREATE UNIQUE INDEX "bom_finishedItemId_key" ON "bom"("finishedItemId");
-- CreateIndex
CREATE UNIQUE INDEX "bom_version_bomId_version_key" ON "bom_version"("bomId", "version");
-- CreateIndex
CREATE UNIQUE INDEX "bom_version_line_bomVersionId_position_key" ON "bom_version_line"("bomVersionId", "position");
-- CreateIndex
CREATE UNIQUE INDEX "production_order_documentId_key" ON "production_order"("documentId");
-- CreateIndex
CREATE UNIQUE INDEX "production_order_line_productionOrderId_position_key" ON "production_order_line"("productionOrderId", "position");
-- CreateIndex
CREATE UNIQUE INDEX "credit_note_documentId_key" ON "credit_note"("documentId");
-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "goods_receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "purchase_order_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "discrepancy" ADD CONSTRAINT "discrepancy_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "goods_receipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "bom" ADD CONSTRAINT "bom_finishedItemId_fkey" FOREIGN KEY ("finishedItemId") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "bom_version" ADD CONSTRAINT "bom_version_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "bom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "bom_version_line" ADD CONSTRAINT "bom_version_line_bomVersionId_fkey" FOREIGN KEY ("bomVersionId") REFERENCES "bom_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "bom_version_line" ADD CONSTRAINT "bom_version_line_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "production_order" ADD CONSTRAINT "production_order_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "production_order" ADD CONSTRAINT "production_order_bomVersionId_fkey" FOREIGN KEY ("bomVersionId") REFERENCES "bom_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "production_order_line" ADD CONSTRAINT "production_order_line_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "production_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "production_order_line" ADD CONSTRAINT "production_order_line_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
