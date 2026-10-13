/**
 * The Document model shared by every numbered record in the product, and the
 * numbering machinery that makes an issued document traceable (ADR 0006).
 */

import { z } from 'zod';
import { partySchema } from './catalog.js';
import {
  moneySchema,
  nonNegativeDecimalSchema,
  quantitySchema,
  rateSchema,
  signedQuantitySchema,
} from './numeric.js';

export const DOCUMENT_TYPES = [
  'SALES_ORDER',
  'PURCHASE_ORDER',
  'DELIVERY_NOTE',
  'GOODS_RECEIPT',
  'PRODUCTION_ORDER',
  'CUSTOMER_INVOICE',
  'CREDIT_NOTE',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const documentTypeSchema = z.enum(DOCUMENT_TYPES).describe('The kind of Document.');

/**
 * A Document is either not yet a fact (`DRAFT`) or an immutable fact (`ISSUED`).
 * `CANCELLED` exists only for orders, whose commercial promise can be withdrawn;
 * a fiscal document is corrected by a Credit Note instead (ADR 0006).
 */
export const DOCUMENT_STATUSES = ['DRAFT', 'ISSUED', 'CANCELLED'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];
export const documentStatusSchema = z.enum(DOCUMENT_STATUSES);

/** Fiscal documents only. Orders are never cancelled once issued by correction. */
export const FISCAL_DOCUMENT_TYPES = ['CUSTOMER_INVOICE', 'CREDIT_NOTE'] as const;

/**
 * Transmission state of a fiscal document (ADR 0011). Separate from the
 * Document status on purpose: transmission can fail on a document that is
 * legally issued, and a retry must never renumber it.
 */
export const EINVOICING_STATES = [
  'OFF',
  'PENDING',
  'SUBMITTED',
  'ACCEPTED',
  'REJECTED',
  'TRANSMISSION_FAILED',
] as const;
export type EInvoicingState = (typeof EINVOICING_STATES)[number];
export const eInvoicingStateSchema = z.enum(EINVOICING_STATES);

/**
 * The complete transition table. Anything absent is illegal, so an unlisted
 * transition is a 409 at the domain layer rather than a silent write.
 */
export const DOCUMENT_TRANSITIONS: Record<
  DocumentType,
  Partial<Record<DocumentStatus, readonly DocumentStatus[]>>
> = {
  SALES_ORDER: { DRAFT: ['ISSUED', 'CANCELLED'], ISSUED: ['CANCELLED'] },
  PURCHASE_ORDER: { DRAFT: ['ISSUED', 'CANCELLED'], ISSUED: ['CANCELLED'] },
  DELIVERY_NOTE: { DRAFT: ['ISSUED'] },
  GOODS_RECEIPT: { DRAFT: ['ISSUED'] },
  PRODUCTION_ORDER: { DRAFT: ['ISSUED', 'CANCELLED'], ISSUED: ['CANCELLED'] },
  CUSTOMER_INVOICE: { DRAFT: ['ISSUED'] },
  CREDIT_NOTE: { DRAFT: ['ISSUED'] },
};

export function canTransition(
  type: DocumentType,
  from: DocumentStatus,
  to: DocumentStatus,
): boolean {
  return DOCUMENT_TRANSITIONS[type][from]?.includes(to) ?? false;
}

/** Every status reachable from `from`, for a dropdown or an error message. */
export function allowedTransitions(
  type: DocumentType,
  from: DocumentStatus,
): readonly DocumentStatus[] {
  return DOCUMENT_TRANSITIONS[type][from] ?? [];
}

/** A Draft may be edited. An Issued document never is; corrections are new documents. */
export function isEditable(status: DocumentStatus): boolean {
  return status === 'DRAFT';
}

/** A Draft is unnumbered, so it can be discarded without leaving a legal gap. */
export function isNumbered(status: DocumentStatus): boolean {
  return status !== 'DRAFT';
}

export function isFiscal(type: DocumentType): type is (typeof FISCAL_DOCUMENT_TYPES)[number] {
  return FISCAL_DOCUMENT_TYPES.includes(type as (typeof FISCAL_DOCUMENT_TYPES)[number]);
}

// ---------------------------------------------------------------------------
// Numbering
// ---------------------------------------------------------------------------

export const NUMBER_TOKEN = '{seq}';

/**
 * A number pattern carries a sequence token and optionally a year, e.g.
 * `FA-{year}-{seq}`. The sequence is zero-padded to `padding` digits.
 */
export const numberPatternSchema = z
  .string()
  .min(3)
  .max(64)
  .refine((pattern) => pattern.split(NUMBER_TOKEN).length === 2, {
    message: `a number pattern must contain exactly one ${NUMBER_TOKEN} token`,
  })
  .refine((pattern) => /^[A-Za-z0-9{}/-]+$/.test(pattern), {
    message: 'a number pattern accepts letters, digits, braces, dashes, slashes',
  });

export type NumberPattern = z.infer<typeof numberPatternSchema>;

export interface DocumentNumberInput {
  readonly sequence: number;
  readonly year: number;
  /**
   * Digits the sequence is zero-padded to, read from the stored Number Pattern.
   * Required rather than defaulted: a default would let the stored padding be
   * ignored again, which is the defect this argument exists to close.
   */
  readonly padding: number;
}

/**
 * Render the Document number for a sequence value. Pure and total: given a
 * valid pattern, padding and a positive integer it always yields a unique
 * string, which is what makes a Number series gapless (ADR 0006).
 */
export function renderDocumentNumber(
  pattern: NumberPattern,
  { sequence, year, padding }: DocumentNumberInput,
): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new RangeError(`document sequence must be a positive integer, received ${sequence}`);
  }
  if (!Number.isInteger(padding) || padding < 1) {
    throw new RangeError(`document number padding must be a positive integer, received ${padding}`);
  }
  return pattern
    .replace('{year}', String(year))
    .replace(NUMBER_TOKEN, String(sequence).padStart(padding, '0'));
}

/**
 * A Number series is the atomic counter guaranteeing an unbroken sequence.
 * `nextValue` is what the next issued document will receive; it never rewinds.
 */
export const numberSeriesSchema = z.object({
  documentType: documentTypeSchema,
  year: z.number().int().min(2000).max(2999),
  nextValue: z.number().int().min(1),
});

export type NumberSeries = z.infer<typeof numberSeriesSchema>;

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

/**
 * What a client may submit for an order line. Deliberately absent: unit price,
 * tax rate, discount and every total. The server resolves those from the Item
 * and recomputes them on every mutation (ADR 0005) — a client able to send a
 * price can forge an invoice.
 *
 * Strict rather than lenient: a request carrying `unitPrice` is rejected
 * outright, so a client that tries to price its own document is told, instead of
 * having the field silently dropped while it believes it was applied.
 */
export const orderLineInputSchema = z.strictObject({
  itemId: z.string().min(1),
  quantity: quantitySchema,
  unitOfMeasureId: z.string().min(1).optional(),
  description: z.string().max(500).optional(),
});
export type OrderLineInput = z.infer<typeof orderLineInputSchema>;

/** A line as the server priced it. Never accepted from a client. */
export const orderLineSchema = orderLineInputSchema.extend({
  /** The stored row id. Served so a correction can name the line it reverses. */
  id: z.string().min(1),
  unitPrice: moneySchema.describe('Resolved from the Item price, never from the request.'),
  taxRate: rateSchema.describe('Resolved from the Item tax assignment.'),
  netAmount: moneySchema,
  taxAmount: moneySchema,
  grossAmount: moneySchema,
});
export type OrderLine = z.infer<typeof orderLineSchema>;

export const documentTotalsSchema = z.object({
  netAmount: moneySchema,
  taxAmount: moneySchema,
  grossAmount: moneySchema,
  /** Retenue à la source, a legal deduction in some regimes. Zero elsewhere. */
  withholdingTaxAmount: moneySchema,
  /** Stamp duty. Carried as a separate line, never inside the VAT base (ADR 0011). */
  stampDutyAmount: moneySchema,
});
export type DocumentTotals = z.infer<typeof documentTotalsSchema>;

export const documentSchema = z.object({
  id: z.string().min(1),
  type: documentTypeSchema,
  status: documentStatusSchema,
  /** Null while the Document is a Draft; assigned once, never reassigned. */
  number: z.string().min(1).nullable(),
  partyId: z.string().min(1),
  issuedAt: z.string().datetime().nullable(),
  totals: documentTotalsSchema,
});
export type Document = z.infer<typeof documentSchema>;

/**
 * A Document as a list row: identity, counterparty, status and total — never
 * lines. Every Document type shares the one table (ADR 0014), so every type
 * shares this row: one definition behind every list screen.
 */
export const documentSummarySchema = z.object({
  id: z.string().min(1),
  type: documentTypeSchema,
  status: documentStatusSchema,
  /** Null while the Document is a Draft; assigned once, never reassigned. */
  number: z.string().min(1).nullable(),
  partyId: z.string().min(1),
  /** The counterparty's name at read time, so a list explains itself. */
  partyName: z.string().min(1),
  issuedAt: z.string().datetime().nullable(),
  grossAmount: moneySchema,
  currency: z.string().length(3),
});
export type DocumentSummary = z.infer<typeof documentSummarySchema>;

/**
 * What a list request may carry: a page, an optional status filter and a
 * free-text query matched against the Document number. Strict, so an unknown
 * filter is a named error rather than a silently ignored one.
 */
export const documentListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    status: documentStatusSchema.optional(),
    q: z.string().trim().max(64).optional(),
  })
  .strict();
export type DocumentListQuery = z.infer<typeof documentListQuerySchema>;

export const openDocumentStatuses = DOCUMENT_STATUSES.filter((status) => status !== 'CANCELLED');
export type OpenDocumentStatus = (typeof openDocumentStatuses)[number];

export function isOpen(status: DocumentStatus): status is 'DRAFT' | 'ISSUED' {
  return status === 'DRAFT' || status === 'ISSUED';
}

// ---------------------------------------------------------------------------
// Sales Order (spec 001 stories 33–45)
// ---------------------------------------------------------------------------

/**
 * A Sales Order line. Reuses `orderLineSchema` so an order and an invoice price a
 * line identically — the server resolves the price and rate from the Item at
 * every mutation (ADR 0005), and what the order promised is what the invoice
 * bills. `deliveredQuantity` is additive state over the reservations the order
 * created; it is 0 on a Draft and grows as Delivery Notes issue against it.
 */
export const salesOrderLineSchema = orderLineSchema.extend({
  deliveredQuantity: nonNegativeDecimalSchema.describe(
    'Units already shipped by issued Delivery Notes; increases, never resets.',
  ),
});
export type SalesOrderLine = z.infer<typeof salesOrderLineSchema>;

/**
 * A Sales Order as the API returns it.
 *
 * `party` mirrors the Customer Invoice's shape: the fields a screen or a print
 * needs, not the whole record. The order is a promise, not a fact, so it carries
 * no `archive` — an order is never served back as bytes.
 */
export const salesOrderSchema = documentSchema.extend({
  businessId: z.string().min(1),
  party: partySchema.pick({
    id: true,
    code: true,
    name: true,
    taxIdentifier: true,
    address: true,
    city: true,
    countryCode: true,
  }),
  lines: z.array(salesOrderLineSchema),
});
export type SalesOrder = z.infer<typeof salesOrderSchema>;

/** What a client submits when drafting an order. Money never travels (ADR 0005). */
export const draftSalesOrderSchema = z.strictObject({
  businessId: z.string().min(1),
  partyId: z.string().min(1),
  lines: z.array(orderLineInputSchema).min(1),
});
export type DraftSalesOrder = z.infer<typeof draftSalesOrderSchema>;

/**
 * A partial edit of a Draft order. Lines, when present, replace the whole set:
 * the server re-prices what remains and drops what was removed. An empty patch
 * is a client bug and is refused.
 */
export const salesOrderUpdateSchema = z
  .object({
    partyId: z.string().min(1).optional(),
    lines: z.array(orderLineInputSchema).min(1).optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'an empty patch changes nothing and is a client bug',
  });
export type SalesOrderUpdate = z.infer<typeof salesOrderUpdateSchema>;

// ---------------------------------------------------------------------------
// Delivery Note (spec 001 stories 46–48)
// ---------------------------------------------------------------------------

/**
 * A Delivery Note line. `salesOrderLineId` is present when this line fulfils an
 * order line; absent for a standalone Delivery Note. The link is advisory on the
 * *document* — a Delivery Note may stand alone (expansion decisions Q11) — but
 * when it is present it is the reservation bookkeeping that releases.
 */
export const deliveryNoteLineInputSchema = z.strictObject({
  itemId: z.string().min(1),
  quantity: quantitySchema,
  unitOfMeasureId: z.string().min(1).optional(),
  description: z.string().max(500).optional(),
  salesOrderLineId: z.string().min(1).optional(),
});
export type DeliveryNoteLineInput = z.infer<typeof deliveryNoteLineInputSchema>;

export const draftDeliveryNoteSchema = z.strictObject({
  businessId: z.string().min(1),
  /** The recipient. Absent only if it would repeat the Sales Order's party. */
  partyId: z.string().min(1).optional(),
  /** The order this note fulfils, when it fulfils one. Optional and advisory (Q11). */
  salesOrderId: z.string().min(1).optional(),
  lines: z.array(deliveryNoteLineInputSchema).min(1),
});
export type DraftDeliveryNote = z.infer<typeof draftDeliveryNoteSchema>;

/** A Delivery Note line as served: the resolved item and, if fulfilled, its order line. */
export const deliveryNoteLineSchema = z.object({
  id: z.string().min(1),
  itemId: z.string().min(1),
  description: z.string().min(1).max(500),
  quantity: quantitySchema,
  unitOfMeasureId: z.string().min(1),
  salesOrderLineId: z.string().min(1).nullable(),
});
export type DeliveryNoteLine = z.infer<typeof deliveryNoteLineSchema>;

/**
 * A Delivery Note as the API returns it. It is a Document — numbered, immutable,
 * quoted in its own series — but it is not fiscal and carries no archive: stock
 * movements are recorded in the ledger, not in a file (ADR 0004).
 */
export const deliveryNoteSchema = documentSchema.extend({
  businessId: z.string().min(1),
  party: partySchema
    .pick({
      id: true,
      code: true,
      name: true,
      address: true,
      city: true,
      countryCode: true,
    })
    .nullable(),
  /** The order this note fulfilled, when it fulfilled one; advisory (Q11). */
  salesOrderId: z.string().min(1).nullable(),
  salesOrderNumber: z.string().min(1).nullable(),
  lines: z.array(deliveryNoteLineSchema),
});
export type DeliveryNote = z.infer<typeof deliveryNoteSchema>;

/** The VAT regime of the Business (CONTEXT.md). Governs whether a breakdown is printed. */
export const VAT_REGIMES = ['STANDARD', 'EXEMPT'] as const;
export type VatRegime = (typeof VAT_REGIMES)[number];
export const vatRegimeSchema = z.enum(VAT_REGIMES);

// ---------------------------------------------------------------------------
// Customer Invoice (the first Document type with an HTTP surface)
// ---------------------------------------------------------------------------

/**
 * The three locales an instance reads in (ADR 0009). Declared here rather than in
 * the API because the web app renders the same document and must not hold its own
 * list: two lists drift, and the drift shows up as an Arabic invoice in English.
 */
export const LOCALES = ['fr', 'en', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];
export const localeSchema = z.enum(LOCALES).describe('The locale the Document prints in.');

/** One line of the printed per-rate breakdown. Derived from the lines, never sent. */
export const documentTaxGroupSchema = z.object({
  rate: rateSchema,
  base: moneySchema.describe('Taxable base for this rate: the sum of the line nets carrying it.'),
  amount: moneySchema,
});
export type DocumentTaxGroup = z.infer<typeof documentTaxGroupSchema>;

/**
 * Where the archival PDF lives and what it hashes to (ADR 0010).
 *
 * Null while a Draft has no document and in the small window after issue where the
 * number exists but the file has not been written yet. Nullable rather than
 * absent, so "issued but not yet archived" is representable and therefore
 * detectable instead of looking like a bug.
 */
export const documentArchiveSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  archivedAt: z.string().datetime(),
  byteLength: z.number().int().nonnegative(),
});
export type DocumentArchive = z.infer<typeof documentArchiveSchema>;

/**
 * A Customer Invoice as the API returns it.
 *
 * Extends `documentSchema` rather than restating it: the common fields, the status
 * transitions and the numbering rules are one definition, so a Document and a
 * Customer Invoice cannot drift apart on `status` or `number`.
 */
export const customerInvoiceSchema = documentSchema.extend({
  businessId: z.string().min(1),
  party: partySchema.pick({
    id: true,
    code: true,
    name: true,
    taxIdentifier: true,
    address: true,
    city: true,
    countryCode: true,
  }),
  locale: localeSchema,
  vatRegime: vatRegimeSchema,
  currency: z.string().length(3),
  lines: z.array(orderLineSchema),
  taxGroups: z.array(documentTaxGroupSchema),
  archive: documentArchiveSchema.nullable(),
});
export type CustomerInvoice = z.infer<typeof customerInvoiceSchema>;

/** What a client may submit when drafting. Carries no money at all (ADR 0005). */
export const draftCustomerInvoiceSchema = z.strictObject({
  businessId: z.string().min(1),
  partyId: z.string().min(1),
  locale: localeSchema,
  lines: z.array(orderLineInputSchema).min(1),
});
export type DraftCustomerInvoice = z.infer<typeof draftCustomerInvoiceSchema>;

// ---------------------------------------------------------------------------
// Credit Note (spec 001 stories 63–69; ADR 0006, ADR 0016, ADR 0017)
// ---------------------------------------------------------------------------

/**
 * One line of a Draft Credit Note. The client says *what and how much* of an
 * Issued Invoice line to reverse; the price, the tax rate and every amount are
 * the Invoice line's stored figures, never the Item's current ones — a price
 * changed after billing must not alter the correction of what was billed.
 * Money never travels (ADR 0005).
 */
export const creditNoteLineInputSchema = z.strictObject({
  invoiceLineId: z.string().min(1),
  quantity: quantitySchema.describe('How much of the Invoice line to reverse, strictly positive.'),
});
export type CreditNoteLineInput = z.infer<typeof creditNoteLineInputSchema>;

/** What a client may submit when drafting: which Invoice to correct, and how much of it. */
export const draftCreditNoteSchema = z.strictObject({
  businessId: z.string().min(1),
  /** The Issued Invoice being corrected. Always issued, never overdrawn. */
  invoiceId: z.string().min(1),
  lines: z.array(creditNoteLineInputSchema).min(1),
});
export type DraftCreditNote = z.infer<typeof draftCreditNoteSchema>;

/**
 * A Credit Note line as served. It is a priced line — same shape as an order
 * line — with signed quantity and amounts: the reversal is printed as a
 * subtraction, and `correctsDocumentLineId` names the Invoice line it reverses.
 */
export const creditNoteLineSchema = z.object({
  itemId: z.string().min(1),
  unitOfMeasureId: z.string().min(1),
  description: z.string().max(500).optional(),
  quantity: signedQuantitySchema.describe('Negative: the reversal of the billed quantity.'),
  unitPrice: moneySchema,
  taxRate: rateSchema,
  netAmount: moneySchema,
  taxAmount: moneySchema,
  grossAmount: moneySchema,
  correctsDocumentLineId: z.string().min(1),
});
export type CreditNoteLine = z.infer<typeof creditNoteLineSchema>;

/**
 * A Credit Note as the API returns it. A fiscal Document like the Invoice it
 * corrects: numbered in its own `AV-` series, archived as a PDF, immutable once
 * issued. It lists lines and tax groups just like the Invoice, and names the
 * Invoice it corrects so an accountant can close the loop without a lookup.
 */
export const creditNoteSchema = documentSchema.extend({
  businessId: z.string().min(1),
  party: partySchema.pick({
    id: true,
    code: true,
    name: true,
    taxIdentifier: true,
    address: true,
    city: true,
    countryCode: true,
  }),
  locale: localeSchema,
  vatRegime: vatRegimeSchema,
  currency: z.string().length(3),
  corrected: z.object({
    documentId: z.string().min(1),
    /** The Invoice's number, known as soon as the Invoice was issued. */
    number: z.string().min(1),
  }),
  lines: z.array(creditNoteLineSchema),
  taxGroups: z.array(documentTaxGroupSchema),
  archive: documentArchiveSchema.nullable(),
});
export type CreditNote = z.infer<typeof creditNoteSchema>;

// ---------------------------------------------------------------------------
// Purchase Order (spec 002 stories 77–80)
// ---------------------------------------------------------------------------

/**
 * A Purchase Order line. Reuses `orderLineSchema` so an order prices a
 * line identically — the server resolves the purchase price and tax rate
 * from the Item at every mutation (ADR 0005).
 */
export const purchaseOrderLineSchema = orderLineSchema;
export type PurchaseOrderLine = z.infer<typeof purchaseOrderLineSchema>;

/**
 * A Purchase Order as the API returns it.
 */
export const purchaseOrderSchema = documentSchema.extend({
  businessId: z.string().min(1),
  party: partySchema
    .pick({
      id: true,
      code: true,
      name: true,
      taxIdentifier: true,
      address: true,
      city: true,
      countryCode: true,
    })
    .nullable(),
  lines: z.array(purchaseOrderLineSchema),
  taxGroups: z.array(documentTaxGroupSchema),
});
export type PurchaseOrder = z.infer<typeof purchaseOrderSchema>;

/** What a client may submit when drafting. Carries no money (ADR 0005). */
export const draftPurchaseOrderSchema = z.strictObject({
  businessId: z.string().min(1),
  partyId: z.string().min(1).optional(),
  lines: z.array(orderLineInputSchema).min(1),
});
export type DraftPurchaseOrder = z.infer<typeof draftPurchaseOrderSchema>;

/** A partial edit of a Draft order. Lines replace the whole set. */
export const purchaseOrderUpdateSchema = z
  .object({
    partyId: z.string().min(1).optional(),
    lines: z.array(orderLineInputSchema).min(1).optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'an empty patch changes nothing and is a client bug',
  });
export type PurchaseOrderUpdate = z.infer<typeof purchaseOrderUpdateSchema>;

// ---------------------------------------------------------------------------
// Goods Receipt (spec 002 stories 81–84)
// ---------------------------------------------------------------------------

/**
 * A Goods Receipt line. `purchaseOrderLineId` is present when this line fulfils
 * an order line; absent for a standalone Goods Receipt.
 */
export const goodsReceiptLineInputSchema = z.strictObject({
  itemId: z.string().min(1),
  quantity: quantitySchema,
  unitOfMeasureId: z.string().min(1).optional(),
  description: z.string().max(500).optional(),
  purchaseOrderLineId: z.string().min(1).optional(),
});
export type GoodsReceiptLineInput = z.infer<typeof goodsReceiptLineInputSchema>;

/** What a client may submit when drafting a receipt. */
export const draftGoodsReceiptSchema = z.strictObject({
  businessId: z.string().min(1),
  partyId: z.string().min(1).optional(),
  /** The order this receipt fulfils, when it fulfils one. Optional and advisory. */
  purchaseOrderId: z.string().min(1).optional(),
  lines: z.array(goodsReceiptLineInputSchema).min(1),
});
export type DraftGoodsReceipt = z.infer<typeof draftGoodsReceiptSchema>;

/** A Goods Receipt line as served. */
export const goodsReceiptLineSchema = z.object({
  id: z.string().min(1),
  itemId: z.string().min(1),
  description: z.string().min(1).max(500),
  quantity: quantitySchema,
  unitOfMeasureId: z.string().min(1),
  purchaseOrderLineId: z.string().min(1).nullable(),
});
export type GoodsReceiptLine = z.infer<typeof goodsReceiptLineSchema>;

/**
 * A Goods Receipt as the API returns it. It is a Document — numbered, immutable,
 * quoted in its own series — but it is not fiscal and carries no archive.
 */
export const goodsReceiptSchema = documentSchema.extend({
  businessId: z.string().min(1),
  party: partySchema
    .pick({
      id: true,
      code: true,
      name: true,
      address: true,
      city: true,
      countryCode: true,
    })
    .nullable(),
  /** The order this receipt fulfilled, when it fulfilled one; advisory. */
  purchaseOrderId: z.string().min(1).nullable(),
  purchaseOrderNumber: z.string().min(1).nullable(),
  lines: z.array(goodsReceiptLineSchema),
});
export type GoodsReceipt = z.infer<typeof goodsReceiptSchema>;

// ---------------------------------------------------------------------------
// Production Order (spec 002 stories 87–91)
// ---------------------------------------------------------------------------

/**
 * A Production Order line. Component requirements are snapshotted from the
 * BOM version at issue time (spec 002 story 88).
 */
export const productionOrderLineSchema = orderLineSchema;
export type ProductionOrderLine = z.infer<typeof productionOrderLineSchema>;

/**
 * A Production Order as the API returns it.
 */
export const productionOrderSchema = documentSchema.extend({
  businessId: z.string().min(1),
  lines: z.array(productionOrderLineSchema),
});
export type ProductionOrder = z.infer<typeof productionOrderSchema>;

/** What a client may submit when drafting a Production Order. */
export const draftProductionOrderSchema = z.strictObject({
  businessId: z.string().min(1),
  bomVersionId: z.string().min(1),
  lines: z.array(orderLineInputSchema).min(1),
});
export type DraftProductionOrder = z.infer<typeof draftProductionOrderSchema>;

/** A partial edit of a Draft Production Order. Lines replace the whole set. */
export const productionOrderUpdateSchema = z
  .object({
    lines: z.array(orderLineInputSchema).min(1).optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'an empty patch changes nothing and is a client bug',
  });
export type ProductionOrderUpdate = z.infer<typeof productionOrderUpdateSchema>;
