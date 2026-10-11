import { Module } from '@nestjs/common';
import { NumberingModule } from '../numbering/numbering.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { PurchaseOrderController } from './purchase-order.controller.js';
import { PurchaseOrderService } from './purchase-order.service.js';
import { GoodsReceiptController } from './goods-receipt.controller.js';
import { GoodsReceiptService } from './goods-receipt.service.js';

@Module({
  imports: [PrismaModule, AuditModule, InventoryModule, NumberingModule, DocumentsModule],
  controllers: [PurchaseOrderController, GoodsReceiptController],
  providers: [PurchaseOrderService, GoodsReceiptService],
  exports: [PurchaseOrderService, GoodsReceiptService],
})
export class PurchasingModule {}