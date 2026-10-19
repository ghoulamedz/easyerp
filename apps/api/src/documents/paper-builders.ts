/**
 * Paper-view builders: from the API response shapes the services already map
 * (`@easyerp/contracts`) onto the render model of paper-document.ts.
 *
 * One builder per paper. Inputs per call: the issued document, the issuer's
 * Business row, and (for the quantities papers) the resolved Unit codes. No
 * builder ever recomputes a figure — they carry the stored values across, which
 * is the discipline the whole document layer runs on.
 */

import type {
  DeliveryNote,
  GoodsReceipt,
  Locale,
  ProductionOrder,
  PurchaseOrder,
  SalesOrder,
} from '@easyerp/contracts';

import {
  paperIssuerOf,
  paperPartyOf,
  pricedPaperView,
  quantityPaperView,
  type PaperIssuerInput,
  type PaperReference,
  type PaperTotalsInput,
  type PaperView,
} from './paper-document.js';

/** Unit codes for the quantity lines of a paper, keyed by unit id. */
export type UnitCodes = ReadonlyMap<string, string>;

/** The Sales Order paper: priced, with the stored totals block. */
export function salesOrderPaperView(
  order: SalesOrder,
  issuer: PaperIssuerInput,
  locale: Locale,
): PaperView {
  return pricedPaperView({
    kind: 'SALES_ORDER',
    locale,
    status: order.status,
    number: order.number ?? '',
    issuedAt: dateOf(order.issuedAt),
    issuer: paperIssuerOf(issuer),
    party: paperPartyOf({
      name: order.party.name,
      taxIdentifier: order.party.taxIdentifier,
      address: order.party.address,
      city: order.party.city,
      countryCode: order.party.countryCode,
    }),
    references: [],
    lines: order.lines.map((line) => ({
      description: line.description ?? '',
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxRate: line.taxRate,
      netAmount: line.netAmount,
      taxAmount: line.taxAmount,
      grossAmount: line.grossAmount,
    })),
    // The same breakdown the Purchase Order prints: a Sales Order quotes the VAT it
    // charges, so a total with no per-rate rows beside it is an unfinished paper.
    taxGroups: order.taxGroups.map((group) => ({
      rate: group.rate,
      base: group.base,
      amount: group.amount,
    })),
    totals: paperTotals(order),
  });
}

/** The Purchase Order paper: priced like an order, addressed to the Supplier. */
export function purchaseOrderPaperView(
  order: PurchaseOrder,
  issuer: PaperIssuerInput,
  locale: Locale,
): PaperView {
  return pricedPaperView({
    kind: 'PURCHASE_ORDER',
    locale,
    status: order.status,
    number: order.number ?? '',
    issuedAt: dateOf(order.issuedAt),
    issuer: paperIssuerOf(issuer),
    party: paperPartyOf(
      order.party
        ? {
            name: order.party.name,
            taxIdentifier: order.party.taxIdentifier,
            address: order.party.address,
            city: order.party.city,
            countryCode: order.party.countryCode,
          }
        : null,
    ),
    references: [],
    lines: order.lines.map((line) => ({
      description: line.description ?? '',
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxRate: line.taxRate,
      netAmount: line.netAmount,
      taxAmount: line.taxAmount,
      grossAmount: line.grossAmount,
    })),
    taxGroups: order.taxGroups.map((group) => ({
      rate: group.rate,
      base: group.base,
      amount: group.amount,
    })),
    totals: paperTotals(order),
  });
}

/** The Delivery Note paper: quantities only, tied to the order it fulfils. */
export function deliveryNotePaperView(
  note: DeliveryNote,
  issuer: PaperIssuerInput,
  units: UnitCodes,
  locale: Locale,
): PaperView {
  const references: PaperReference[] =
    note.salesOrderNumber !== null
      ? [{ code: 'salesOrder', value: note.salesOrderNumber }]
      : [];

  return quantityPaperView({
    kind: 'DELIVERY_NOTE',
    locale,
    status: note.status,
    number: note.number ?? '',
    issuedAt: dateOf(note.issuedAt),
    issuer: paperIssuerOf(issuer),
    party: paperPartyOf(
      note.party
        ? {
            name: note.party.name,
            address: note.party.address,
            city: note.party.city,
            countryCode: note.party.countryCode,
          }
        : null,
    ),
    references,
    lines: note.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitCode: units.get(line.unitOfMeasureId) ?? null,
    })),
  });
}

/** The Goods Receipt paper: quantities received, tied to the order fulfilled. */
export function goodsReceiptPaperView(
  receipt: GoodsReceipt,
  issuer: PaperIssuerInput,
  units: UnitCodes,
  locale: Locale,
): PaperView {
  const references: PaperReference[] =
    receipt.purchaseOrderNumber !== null
      ? [{ code: 'purchaseOrder', value: receipt.purchaseOrderNumber }]
      : [];

  return quantityPaperView({
    kind: 'GOODS_RECEIPT',
    locale,
    status: receipt.status,
    number: receipt.number ?? '',
    issuedAt: dateOf(receipt.issuedAt),
    issuer: paperIssuerOf(issuer),
    party: paperPartyOf(
      receipt.party
        ? {
            name: receipt.party.name,
            address: receipt.party.address,
            city: receipt.party.city,
            countryCode: receipt.party.countryCode,
          }
        : null,
    ),
    references,
    lines: receipt.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitCode: units.get(line.unitOfMeasureId) ?? null,
    })),
  });
}

/**
 * The Production Order paper: the component quantities of one production unit,
 * tied to the finished Item the BOM names. A work order carries no money and no
 * counterparty — its party row (`INTERNAL`) is bookkeeping, not a paper field.
 */
export function productionOrderPaperView(
  order: ProductionOrder,
  issuer: PaperIssuerInput,
  units: UnitCodes,
  finishedItemName: string | null,
  locale: Locale,
): PaperView {
  return quantityPaperView({
    kind: 'PRODUCTION_ORDER',
    locale,
    status: order.status,
    number: order.number ?? '',
    issuedAt: dateOf(order.issuedAt),
    issuer: paperIssuerOf(issuer),
    party: null,
    references:
      finishedItemName !== null ? [{ code: 'finishedItem', value: finishedItemName }] : [],
    lines: order.lines.map((line) => ({
      description: line.description ?? '',
      quantity: line.quantity,
      // The contract leaves a Production Order line's unit optional, and a
      // missing unit prints like the empty cell below — the id never prints.
      unitCode: line.unitOfMeasureId === undefined ? null : (units.get(line.unitOfMeasureId) ?? null),
    })),
  });
}

/** A document's issue date, as the printed `YYYY-MM-DD`. */
function dateOf(issuedAt: string | null): string {
  return issuedAt?.slice(0, 10) ?? '';
}

/** The stored totals, passed through exactly as served. */
function paperTotals(document: {
  totals: { netAmount: string; taxAmount: string; grossAmount: string };
}): PaperTotalsInput {
  return {
    netAmount: document.totals.netAmount,
    taxAmount: document.totals.taxAmount,
    grossAmount: document.totals.grossAmount,
  };
}
