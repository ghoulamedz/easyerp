import { Module } from '@nestjs/common';
import { NumberingModule } from '../numbering/numbering.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { BomController } from './bom.controller.js';
import { BomService } from './bom.service.js';
import { ProductionOrderController } from './production-order.controller.js';
import { ProductionOrderService } from './production-order.service.js';

@Module({
  imports: [PrismaModule, AuditModule, InventoryModule, NumberingModule, DocumentsModule],
  controllers: [BomController, ProductionOrderController],
  providers: [BomService, ProductionOrderService],
  exports: [BomService, ProductionOrderService],
})
export class ProductionModule {}