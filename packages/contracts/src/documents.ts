/**
 * The Document model shared by every numbered record in the product, and the
 * numbering machinery that makes an issued document traceable (ADR 0006).
 */

import { z } from 'zod';
import { moneySchema, quantitySchema, rateSchema } from './numeric.js';

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

const ALL_STATUSES = DOCUMENT_STATUSES;

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
  return DOCUMENT_TRANSITIONS[type][from] ?? ALL_STATUSES.filter(() => false);
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
}

/**
 * Render the Document number for a sequence value. Pure and total: given a
 * valid pattern and a positive integer it always yields a unique string, which
 * is what makes a Number series gapless (ADR 0006).
 */
export function renderDocumentNumber(
  pattern: NumberPattern,
  { sequence, year }: DocumentNumberInput,
): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new RangeError(`document sequence must be a positive integer, received ${sequence}`);
  }
  const width = Math.max(1, String(sequence).length);
  return pattern
    .replace('{year}', String(year))
    .replace(NUMBER_TOKEN, String(sequence).padStart(width, '0'));
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

/** The VAT regime of the Business (CONTEXT.md). Governs whether a breakdown is printed. */
export const VAT_REGIMES = ['STANDARD', 'EXEMPT'] as const;
export type VatRegime = (typeof VAT_REGIMES)[number];
export const vatRegimeSchema = z.enum(VAT_REGIMES);
