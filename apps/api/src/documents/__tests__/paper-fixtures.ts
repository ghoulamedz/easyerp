/**
 * The five operational papers, as fixtures for the print goldens.
 *
 * Each fixture goes through the real builder (`paper-builders.ts`) and the real
 * contract schema, so a golden is a statement about the *paper* rather than about
 * a hand-assembled render model: if the schema stops accepting what a built
 * document looks like, that is a failure here rather than a surprise in a service.
 *
 * The five are exercised because they are five different papers — a priced one
 * with a totals block, a priced one with a per-rate breakdown, and three that
 * carry quantities and no money at all. A template that prints the money columns
 * on a Delivery Note is a defect the byte comparison catches and a screenshot
 * review usually does not.
 */

import type {
  DeliveryNote,
  GoodsReceipt,
  ProductionOrder,
  PurchaseOrder,
  SalesOrder,
} from '@easyerp/contracts';
import {
  deliveryNoteSchema,
  goodsReceiptSchema,
  productionOrderSchema,
  purchaseOrderSchema,
  salesOrderSchema,
} from '@easyerp/contracts';

import { terminologyFor, type Locale } from '../../finance/terminology.js';
import {
  deliveryNotePaperView,
  goodsReceiptPaperView,
  productionOrderPaperView,
  purchaseOrderPaperView,
  salesOrderPaperView,
  type UnitCodes,
} from '../paper-builders.js';
import type { PaperView } from '../paper-document.js';

/**
 * The issuer every fixture prints.
 *
 * French accents and an Arabic-adjacent address on purpose: the goldens have to
 * show what the template does with text that is not ASCII, in both directions.
 */
export const ISSUER = {
  legalName: 'Société Atelier du Sahel',
  displayName: 'Atelier du Sahel',
  taxIdentifier: '1234567/A/M/000',
  addressLine1: '12 rue de la Liberté',
  city: '1000 Tunis',
  countryCode: 'TN',
};

const TOTALS = {
  netAmount: '330.000',
  fodecAmount: '3.300',
  taxAmount: '63.327',
  grossAmount: '393.327',
  withholdingTaxAmount: '0.000',
  stampDutyAmount: '1.000',
};

const PRICED_LINE = {
  id: 'line-1',
  itemId: 'item-1',
  description: 'Prestation de développement',
  quantity: '2.000',
  unitPrice: '125.000',
  taxRate: '19.000',
  netAmount: '250.000',
  fodecAmount: '2.500',
  taxAmount: '47.975',
  grossAmount: '297.975',
  unitOfMeasureId: 'unit-1',
};

const SECOND_LINE = { ...PRICED_LINE, description: 'Fournitures', quantity: '1.000' };

const CUSTOMER = {
  id: 'party-1',
  code: 'CLI-0001',
  name: 'Carthage Distribution',
  taxIdentifier: '9876543/B/M/000',
  address: 'Zone industrielle de Ben Arous',
  city: '2033 Ben Arous',
  countryCode: 'TN',
};

const SUPPLIER = {
  id: 'party-2',
  code: 'FOU-0001',
  name: 'Méditerranée Composants',
  taxIdentifier: null,
  address: 'Rue du Port, La Goulette',
  city: '2060 La Goulette',
  countryCode: 'TN',
};

/** Unit codes by id, as a service resolves them before rendering. */
export const UNITS: UnitCodes = new Map([
  ['unit-1', 'PCS'],
  ['unit-2', 'KG'],
]);

const DOCUMENT = {
  id: 'doc-1',
  status: 'ISSUED' as const,
  number: 'BC-2026-0042',
  partyId: 'party-1',
  issuedAt: '2026-10-04T09:30:00.000Z',
  totals: TOTALS,
};

export function salesOrder(locale: Locale): PaperView {
  const order: SalesOrder = salesOrderSchema.parse({
    ...DOCUMENT,
    type: 'SALES_ORDER',
    businessId: 'business-1',
    party: CUSTOMER,
    lines: [
      { ...PRICED_LINE, deliveredQuantity: '0.000' },
      { ...SECOND_LINE, deliveredQuantity: '0.000' },
    ],
  });

  return salesOrderPaperView(order, ISSUER, locale);
}

export function purchaseOrder(locale: Locale): PaperView {
  const order: PurchaseOrder = purchaseOrderSchema.parse({
    ...DOCUMENT,
    number: 'CF-2026-0042',
    type: 'PURCHASE_ORDER',
    businessId: 'business-1',
    party: SUPPLIER,
    lines: [PRICED_LINE, SECOND_LINE],
    taxGroups: [
      { rate: '19.000', base: '330.000', amount: '62.700' },
    ],
  });

  return purchaseOrderPaperView(order, ISSUER, locale);
}

export function deliveryNote(locale: Locale): PaperView {
  const note: DeliveryNote = deliveryNoteSchema.parse({
    ...DOCUMENT,
    number: 'BL-2026-0042',
    type: 'DELIVERY_NOTE',
    businessId: 'business-1',
    salesOrderId: 'so-1',
    salesOrderNumber: 'BC-2026-0042',
    party: CUSTOMER,
    lines: [
      {
        id: 'line-1',
        itemId: 'item-1',
        description: 'Prestation de développement',
        quantity: '2.000',
        unitOfMeasureId: 'unit-1',
        salesOrderLineId: null,
      },
      {
        id: 'line-2',
        itemId: 'item-2',
        description: 'Fournitures',
        quantity: '1.500',
        unitOfMeasureId: 'unit-2',
        salesOrderLineId: null,
      },
    ],
  });

  return deliveryNotePaperView(note, ISSUER, UNITS, locale);
}

export function goodsReceipt(locale: Locale): PaperView {
  const receipt: GoodsReceipt = goodsReceiptSchema.parse({
    ...DOCUMENT,
    number: 'BR-2026-0042',
    type: 'GOODS_RECEIPT',
    businessId: 'business-1',
    purchaseOrderId: 'po-1',
    purchaseOrderNumber: 'CF-2026-0042',
    party: SUPPLIER,
    lines: [
      {
        id: 'line-1',
        itemId: 'item-1',
        description: 'Prestation de développement',
        quantity: '2.000',
        unitOfMeasureId: 'unit-1',
        purchaseOrderLineId: null,
      },
    ],
  });

  return goodsReceiptPaperView(receipt, ISSUER, UNITS, locale);
}

export function productionOrder(locale: Locale): PaperView {
  const order: ProductionOrder = productionOrderSchema.parse({
    ...DOCUMENT,
    number: 'OF-2026-0042',
    type: 'PRODUCTION_ORDER',
    businessId: 'business-1',
    lines: [{ ...PRICED_LINE, description: 'Tôle acier 2mm', quantity: '4.000' }],
  });

  return productionOrderPaperView(order, ISSUER, UNITS, 'Étagère murale 120cm', locale);
}

/**
 * Every paper, by the golden name it is filed under.
 *
 * One table so the goldens cannot cover four of the five because someone forgot
 * the fifth while adding a sixth.
 */
export const PAPERS = {
  'sales-order': salesOrder,
  'purchase-order': purchaseOrder,
  'delivery-note': deliveryNote,
  'goods-receipt': goodsReceipt,
  'production-order': productionOrder,
} as const;

export { terminologyFor };
