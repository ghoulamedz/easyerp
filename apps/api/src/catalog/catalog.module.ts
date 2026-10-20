/**
 * Catalog: the Item master data the Modules' documents price from (spec 001
 * stories 25–32). One module, one controller; the Invoice flow reads Items
 * through Prisma directly and shares no service seam with this module — the
 * catalog is a domain area, not a dependency of Sales.
 */

import { Module } from '@nestjs/common';

import { InventoryModule } from '../inventory/inventory.module.js';
import { ItemController } from './item.controller.js';
import { ItemService } from './item.service.js';

@Module({
  // An Item's opening quantity is a Stock Ledger Entry, so creating one writes to
  // the ledger: the catalog borrows the inventory's service rather than reaching
  // into its table, so the entry keeps the lock, the sequence and the audit row
  // that every other movement gets. The dependency runs one way — Inventory does
  // not know the catalog exists.
  imports: [InventoryModule],
  controllers: [ItemController],
  providers: [ItemService],
})
export class CatalogModule {}
