/**
 * Stock is an append-only ledger. On-hand, Reserved and Available are *derived*,
 * never stored on the Item, because a mutable balance column is what let the
 * legacy system oversell (ADR 0004).
 */

import { z } from 'zod';
import { nonNegativeDecimalSchema, decimalSchema } from './numeric.js';

/** Why a Stock Ledger Entry exists. The reason is mandatory: a correction is audited. */
export const STOCK_LEDGER_REASONS = [
  'OPENING_BALANCE',
  'DELIVERY_NOTE',
  'GOODS_RECEIPT',
  'PRODUCTION_OUT',
  'PRODUCTION_IN',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'REVERSAL',
  'RETURN_IN',
  'RETURN_OUT',
] as const;

export type StockLedgerReason = (typeof STOCK_LEDGER_REASONS)[number];

export const stockLedgerReasonSchema = z.enum(STOCK_LEDGER_REASONS);

/**
 * Which way stock moved. Derived, never chosen independently: an `ADJUSTMENT_IN`
 * that moved stock out is a lie in the audit trail. A `REVERSAL` is the one
 * exception — its direction is whatever undoes the entry it reverses (Q13,
 * CONTEXT.md), so it cannot be a static lookup.
 */
export const STOCK_DIRECTIONS = ['IN', 'OUT'] as const;
export type StockDirection = (typeof STOCK_DIRECTIONS)[number];

export const DIRECTION_BY_REASON: Readonly<
  Record<Exclude<StockLedgerReason, 'REVERSAL'>, StockDirection>
> = {
  OPENING_BALANCE: 'IN',
  DELIVERY_NOTE: 'OUT',
  GOODS_RECEIPT: 'IN',
  PRODUCTION_OUT: 'OUT',
  PRODUCTION_IN: 'IN',
  ADJUSTMENT_IN: 'IN',
  ADJUSTMENT_OUT: 'OUT',
  RETURN_IN: 'IN',
  RETURN_OUT: 'OUT',
};

/** The opposite of a `StockDirection`; a Reversal's direction by construction. */
export function reversedDirection(direction: StockDirection): StockDirection {
  return direction === 'IN' ? 'OUT' : 'IN';
}

/**
 * The direction of an entry whose reason is known. A `REVERSAL` has no direction
 * of its own: it is whichever direction undoes the entry it references.
 */
export function directionOf(reason: StockLedgerReason, reversed?: StockDirection): StockDirection {
  if (reason === 'REVERSAL') {
    return reversedDirection(reversed ?? 'IN');
  }
  return DIRECTION_BY_REASON[reason];
}

/** A Stock Ledger Entry, the only way stock ever changes. */
export const stockLedgerEntrySchema = z.object({
  id: z.string().min(1),
  itemId: z.string().min(1),
  reason: stockLedgerReasonSchema,
  direction: z.enum(STOCK_DIRECTIONS),
  quantity: nonNegativeDecimalSchema.describe('Always positive; the direction carries the sign.'),
  /** The balance before and after this entry, captured inside the same transaction. */
  balanceBefore: nonNegativeDecimalSchema,
  balanceAfter: nonNegativeDecimalSchema,
  documentType: z.string().min(1).nullable(),
  documentId: z.string().min(1).nullable(),
  /** Mandatory on every adjustment and reversal. */
  reasonText: z.string().min(1).max(500).nullable(),
  /** Required whenever the reason is `REVERSAL`: the entry this one undoes. */
  reversesEntryId: z.string().min(1).nullable(),
  occurredAt: z.string().datetime(),
  /** Null on a system-written entry (e.g. a Delivery Note issuing without a session). */
  createdByUserId: z.string().min(1).nullable(),
});
export type StockLedgerEntry = z.infer<typeof stockLedgerEntrySchema>;

/**
 * The stock position of an Item, computed from the ledger and the open
 * Reservations. Nothing here is stored: `onHand` is the latest ledged balance,
 * `reserved` is the sum over open Reservations, `available` is `onHand − reserved`.
 *
 * `available` is deliberately signed: a Business running ALLOW backorders can
 * promise more than it holds, and hiding that behind a zero would hide the very
 * signal a backorder is. On-hand never goes negative — the ledger refuses an OUT
 * that would — but Available may.
 */
export const stockPositionSchema = z.object({
  itemId: z.string().min(1),
  onHand: nonNegativeDecimalSchema,
  reserved: nonNegativeDecimalSchema,
  available: decimalSchema,
});
export type StockPosition = z.infer<typeof stockPositionSchema>;

/**
 * A stock position with the Item identity a screen needs and the reorder signal
 * (story 56). `atOrBelowReorder` warns before a stockout; it is a signal, not a
 * reservation — nothing here stops a document from drawing the stock.
 */
export const stockPositionListItemSchema = stockPositionSchema.extend({
  code: z.string().min(1),
  name: z.string().min(1),
  reorderPoint: nonNegativeDecimalSchema.nullable(),
  atOrBelowReorder: z.boolean(),
});
export type StockPositionListItem = z.infer<typeof stockPositionListItemSchema>;

/**
 * A quantity promised to a confirmed Sales Order. Created by the issuing
 * transaction, released when fulfilled or cancelled — all inside the transaction
 * that changes the order's status.
 *
 * `quantity` is the *original* promised amount and never rewinds. `deliveredQuantity`
 * only grows as Delivery Notes ship against the order. The open amount is
 * `quantity − deliveredQuantity`; an open Reservation is simply
 * `releasedAt IS NULL AND quantity − deliveredQuantity > 0`, and `Available`
 * reads it by summing over just those rows.
 */
export const reservationSchema = z.object({
  id: z.string().min(1),
  itemId: z.string().min(1),
  salesOrderId: z.string().min(1),
  salesOrderLineId: z.string().min(1),
  /** The quantity originally promised; never rewinds. `quantity − deliveredQuantity` is the open amount. */
  quantity: nonNegativeDecimalSchema,
  /** Units already shipped by issued Delivery Notes. Decrements nothing; it only grows. */
  deliveredQuantity: nonNegativeDecimalSchema,
  /** Set once the promise is fully fulfilled or the order is cancelled. */
  releasedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type Reservation = z.infer<typeof reservationSchema>;

/** Per-order permission to deliver against stock that is not Available. */
export const BACKORDER_POLICIES = ['STRICT', 'ALLOW'] as const;
export type BackorderPolicy = (typeof BACKORDER_POLICIES)[number];
export const backorderPolicySchema = z.enum(BACKORDER_POLICIES);

export const stockAdjustmentSchema = z.object({
  itemId: z.string().min(1),
  reason: stockLedgerReasonSchema.pipe(z.enum(['ADJUSTMENT_IN', 'ADJUSTMENT_OUT'])),
  quantity: nonNegativeDecimalSchema,
  reasonText: z.string().min(1).max(500),
});
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;

/** The opening balance of an Item: the first ledger entry, and only the first. */
export const stockOpeningBalanceSchema = z.object({
  itemId: z.string().min(1),
  quantity: nonNegativeDecimalSchema.describe(
    'The quantity already on hand the day the Business starts keeping stock.',
  ),
});
export type StockOpeningBalanceInput = z.infer<typeof stockOpeningBalanceSchema>;

/** Reverse a Stock Ledger Entry, returning the balance it claimed. */
export const stockReversalSchema = z.object({
  entryId: z.string().min(1),
  reasonText: z.string().min(1).max(500),
});
export type StockReversalInput = z.infer<typeof stockReversalSchema>;
