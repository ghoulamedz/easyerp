/**
 * List endpoints for every Document type, Payments and BOMs (ADR 0014).
 *
 * The list services existed without mounted routes: `DocumentListService` was
 * provided by `DocumentsModule` but injected nowhere, and `PaymentsService.list`
 * had no controller route. These tests pin the wiring — one row per type served
 * through the real service against real PostgreSQL, and every new route mounted
 * behind its guards (an unauthenticated request meets 401, not 404).
 */

import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../../app.module.js';
import { DomainExceptionFilter } from '../../common/domain-exception.filter.js';
import { DocumentListService } from '../document-list.service.js';
import { prisma, resetDatabase } from '../../identity/__tests__/harness.js';
import { BomService } from '../../production/bom.service.js';
import { ProductionOrderService } from '../../production/production-order.service.js';
import { GoodsReceiptService } from '../../purchasing/goods-receipt.service.js';
import { PurchaseOrderService } from '../../purchasing/purchase-order.service.js';
import { PaymentsService } from '../../payments/payments.service.js';
import { money } from '@easyerp/contracts';
import { CustomerInvoiceService } from '../../sales/customer-invoice.service.js';
import { DeliveryNoteService } from '../../sales/delivery-note.service.js';
import { SalesOrderService } from '../../sales/sales-order.service.js';

let sequence = 0;

async function givenBusiness() {
  return prisma.business.create({
    data: {
      legalName: 'Société Générale de Tutorat',
      displayName: 'SGT',
      taxIdentifier: '1234567/A/M/000',
      countryCode: 'TN',
    },
  });
}

async function givenParty(roles: Array<'CUSTOMER' | 'SUPPLIER'>) {
  sequence += 1;
  return prisma.party.create({
    data: {
      code: `P-${sequence}`,
      name: 'Atlas Trading',
      roles,
      taxIdentifier: `9876543/B/M/000-${sequence}`,
    },
  });
}

async function givenUnit() {
  sequence += 1;
  return prisma.unit.create({ data: { code: `U-${sequence}`, allowsFraction: false } });
}

async function givenItem(itemType = 'SERVICE') {
  const unit = await givenUnit();
  const taxRate = await prisma.taxRate.create({
    data: { code: `STANDARD_19_${sequence}`, rate: 19 },
  });
  sequence += 1;
  return prisma.item.create({
    data: {
      code: `SAV-${sequence}`,
      name: 'Cours de soutien',
      description: 'Séance de soutien en maths',
      itemType,
      baseUnitId: unit.id,
      taxRateId: taxRate.id,
      salePrice: 100,
    },
  });
}

describe('document, payment and BOM list endpoints', () => {
  let app: INestApplication;
  let baseUrl: string;
  let documents: DocumentListService;
  let orders: SalesOrderService;
  let deliveryNotes: DeliveryNoteService;
  let invoices: CustomerInvoiceService;
  let purchaseOrders: PurchaseOrderService;
  let receipts: GoodsReceiptService;
  let productionOrders: ProductionOrderService;
  let boms: BomService;
  let payments: PaymentsService;

  beforeAll(async () => {
    const server = express();
    app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
      logger: false,
      bodyParser: false,
    });
    app.use(express.json({ limit: '1mb' }));
    app.useGlobalFilters(new DomainExceptionFilter());
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();

    documents = app.get(DocumentListService);
    orders = app.get(SalesOrderService);
    deliveryNotes = app.get(DeliveryNoteService);
    invoices = app.get(CustomerInvoiceService);
    purchaseOrders = app.get(PurchaseOrderService);
    receipts = app.get(GoodsReceiptService);
    productionOrders = app.get(ProductionOrderService);
    boms = app.get(BomService);
    payments = app.get(PaymentsService);
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('lists sales order drafts with counterparty, status and envelope', async () => {
    const business = await givenBusiness();
    const customer = await givenParty(['CUSTOMER']);
    const item = await givenItem();
    await orders.createDraft({
      businessId: business.id,
      partyId: customer.id,
      lines: [{ itemId: item.id, quantity: '3' }],
    });

    const page = await documents.list('SALES_ORDER', {});

    expect(page.total).toBe(1);
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(25);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      type: 'SALES_ORDER',
      status: 'DRAFT',
      number: null,
      partyName: 'Atlas Trading',
    });
  });

  it('filters sales orders by status', async () => {
    const business = await givenBusiness();
    const customer = await givenParty(['CUSTOMER']);
    const item = await givenItem();
    await orders.createDraft({
      businessId: business.id,
      partyId: customer.id,
      lines: [{ itemId: item.id, quantity: '1' }],
    });

    await expect(documents.list('SALES_ORDER', { status: 'ISSUED' })).resolves.toMatchObject({
      total: 0,
      items: [],
    });
  });

  it('lists delivery notes and customer invoices', async () => {
    const business = await givenBusiness();
    const customer = await givenParty(['CUSTOMER']);
    const item = await givenItem();
    await deliveryNotes.createDraft({
      businessId: business.id,
      partyId: customer.id,
      lines: [{ itemId: item.id, quantity: '1' }],
    });
    await invoices.createDraft({
      businessId: business.id,
      partyId: customer.id,
      locale: 'fr',
      lines: [{ itemId: item.id, quantity: '2' }],
    });

    await expect(documents.list('DELIVERY_NOTE', {})).resolves.toMatchObject({ total: 1 });
    const invoicePage = await documents.list('CUSTOMER_INVOICE', {});
    expect(invoicePage.total).toBe(1);
    expect(invoicePage.items[0]).toMatchObject({ partyName: 'Atlas Trading' });
  });

  it('lists purchase orders, goods receipts and production orders', async () => {
    const business = await givenBusiness();
    const supplier = await givenParty(['SUPPLIER']);
    const item = await givenItem('RAW_MATERIAL');
    await purchaseOrders.createDraft({
      businessId: business.id,
      partyId: supplier.id,
      lines: [{ itemId: item.id, quantity: '5' }],
    });
    await receipts.createAndIssue({
      businessId: business.id,
      partyId: supplier.id,
      lines: [{ itemId: item.id, quantity: '5' }],
    });

    const finished = await givenItem('FINISHED_GOOD');
    const component = await givenItem('RAW_MATERIAL');
    const unit = await givenUnit();
    const bom = await boms.create({ finishedItemId: finished.id });
    const version = await boms.createVersion({
      bomId: bom.id,
      lines: [{ itemId: component.id, quantity: '2', unitOfMeasureId: unit.id }],
    });
    // NOTE: seeded directly because ProductionOrderService.createDraft is broken:
    // it stores `partyId: business.id`, which violates document_partyId_fkey on
    // every call (a Business id is never a Party id). Tracked as follow-up; the
    // list under test is a read projection over the document table.
    await prisma.document.create({
      data: {
        type: 'PRODUCTION_ORDER',
        businessId: business.id,
        partyId: supplier.id,
        locale: 'fr',
        vatRegime: 'STANDARD',
        currency: 'TND',
      },
    });
    void productionOrders;
    void version;

    await expect(documents.list('PURCHASE_ORDER', {})).resolves.toMatchObject({ total: 1 });
    await expect(documents.list('GOODS_RECEIPT', {})).resolves.toMatchObject({ total: 1 });
    await expect(documents.list('PRODUCTION_ORDER', {})).resolves.toMatchObject({ total: 1 });
  });

  it('serves an empty-shaped credit note list when none exist', async () => {
    await expect(documents.list('CREDIT_NOTE', {})).resolves.toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 25,
    });
  });

  it('lists payments with their unallocated credit', async () => {
    const business = await givenBusiness();
    const customer = await givenParty(['CUSTOMER']);
    await payments.create({
      businessId: business.id,
      partyId: customer.id,
      amount: money('50.000'),
      allocations: [],
    });

    const page = await payments.list(customer.id, business.id, 1, 25);
    expect(page.total).toBe(1);
    expect(page.items).toHaveLength(1);
    const payment = page.items[0]!;
    expect(payment.amount).toBe('50.000');
    expect(payment.unallocatedCredit).toBe('50.000');
  });

  it('lists BOMs with finished-item identity and version signal', async () => {
    const finished = await givenItem('FINISHED_GOOD');
    const component = await givenItem('RAW_MATERIAL');
    const unit = await givenUnit();
    const bom = await boms.create({ finishedItemId: finished.id });
    await boms.createVersion({
      bomId: bom.id,
      lines: [{ itemId: component.id, quantity: '2', unitOfMeasureId: unit.id }],
    });

    const rows = await boms.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      finishedItemId: finished.id,
      finishedItemCode: finished.code,
      finishedItemName: 'Cours de soutien',
      versionCount: 1,
      latestVersion: 1,
    });
  });

  it('mounts every new list route behind its guards', async () => {
    const routes = [
      '/api/sales/orders',
      '/api/sales/orders/open',
      '/api/sales/delivery-notes',
      '/api/sales/invoices',
      '/api/credit-notes',
      '/api/purchasing/orders',
      '/api/purchasing/receipts',
      '/api/production/orders',
      '/api/production/boms',
      '/api/payments',
    ];
    for (const route of routes) {
      const response = await fetch(`${baseUrl}${route}`);
      expect(response.status, route).toBe(401);
    }
  });
});
