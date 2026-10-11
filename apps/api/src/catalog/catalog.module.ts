/**
 * Catalog: the Item master data the Modules' documents price from (spec 001
 * stories 25–32). One module, one controller; the Invoice flow reads Items
 * through Prisma directly and shares no service seam with this module — the
 * catalog is a domain area, not a dependency of Sales.
 */

import { Module } from '@nestjs/common';

import { ItemController } from './item.controller.js';
import { ItemService } from './item.service.js';

@Module({
  controllers: [ItemController],
  providers: [ItemService],
})
export class CatalogModule {}
