/**
 * Sales: order, Delivery Note, stock ledger and invoice flows together.
 *
 * Kept as one module because the four are not separable in practice: an order
 * reserves against the ledger, a Delivery Note writes to it and releases the
 * reservation, and an invoice prices through the same machinery. A deployment
 * that wires some without the others produces documents that promise stock that
 * never leaves, or leaves stock that was never promised.
 */

import { Module } from '@nestjs/common';

import { env } from '../config/env.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { NumberingModule } from '../numbering/numbering.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { CustomerInvoiceController } from './customer-invoice.controller.js';
import { CustomerInvoiceService } from './customer-invoice.service.js';
import { CreditNoteController } from './credit-note.controller.js';
import { CreditNoteService } from './credit-note.service.js';
import { DeliveryNoteService } from './delivery-note.service.js';
import { DocumentArchive } from './document-archive.js';
import { SalesController } from './sales.controller.js';
import { SalesOrderService } from './sales-order.service.js';

@Module({
  imports: [PrismaModule, SettingsModule, InventoryModule, NumberingModule, DocumentsModule],
  controllers: [CustomerInvoiceController, SalesController, CreditNoteController],
  providers: [
    CustomerInvoiceService,
    SalesOrderService,
    DeliveryNoteService,
    CreditNoteService,
    {
      // A factory rather than a provider class, because the archive root is
      // deployment configuration and the class has no logic that would justify
      // its own file.
      provide: DocumentArchive,
      useFactory: () => new DocumentArchive(env().DOCUMENT_ARCHIVE_ROOT),
    },
  ],
  exports: [CustomerInvoiceService, SalesOrderService, DeliveryNoteService],
})
export class SalesModule {}
