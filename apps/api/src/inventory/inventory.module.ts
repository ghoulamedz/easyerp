/**
 * Inventory: the Stock Ledger (ADR 0004) and its routes.
 *
 * Imported by SalesModule because Sales Order issue reads positions and Delivery
 * Note issue writes entries — they share one ledger, on the caller's transaction.
 */

import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module.js';
import { StockController } from './stock.controller.js';
import { StockLedgerService } from './stock-ledger.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [StockController],
  providers: [StockLedgerService],
  exports: [StockLedgerService],
})
export class InventoryModule {}
