/**
 * Stock is an append-only ledger. On-hand, Reserved and Available are *derived*,
 * never stored on the Item, because a mutable balance column is what let the
 * legacy system oversell (ADR 0004).
 */

import { z } from 'zod';
import { nonNegativeDecimalSchema } from './numeric.js';

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
 * Which way stock moved. Derived from the reason, never chosen independently:
 * an `ADJUSTMENT_IN` that moved stock out is a lie in the audit trail.
 */
export const STOCK_DIRECTIONS = ['IN', 'OUT'] as const;
export type StockDirection = (typeof STOCK_DIRECTIONS)[number];

export const DIRECTION_BY_REASON: Readonly<Record<StockLedgerReason, StockDirection>> = {
  OPENING_BALANCE: 'IN',
  DELIVERY_NOTE: 'OUT',
  GOODS_RECEIPT: 'IN',
  PRODUCTION_OUT: 'OUT',
  PRODUCTION_IN: 'IN',
  ADJUSTMENT_IN: 'IN',
  ADJUSTMENT_OUT: 'OUT',
  REVERSAL: 'OUT',
  RETURN_IN: 'IN',
  RETURN_OUT: 'OUT',
};

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
  occurredAt: z.string().datetime(),
  createdByUserId: z.string().min(1),
});
export type StockLedgerEntry = z.infer<typeof stockLedgerEntrySchema>;

/**
 * The stock position of an Item, computed from the ledger and the open
 * Reservations. `available` is `onHand − reserved` and exists only in responses;
 * no column stores it.
 */
export const stockPositionSchema = z.object({
  itemId: z.string().min(1),
  onHand: nonNegativeDecimalSchema,
  reserved: nonNegativeDecimalSchema,
  available: nonNegativeDecimalSchema,
});
export type StockPosition = z.infer<typeof stockPositionSchema>;

/**
 * A quantity promised to a confirmed Sales Order. Created and released inside
 * the same transaction that changes the order's status.
 */
export const reservationSchema = z.object({
  id: z.string().min(1),
  itemId: z.string().min(1),
  salesOrderId: z.string().min(1),
  salesOrderLineId: z.string().min(1),
  quantity: nonNegativeDecimalSchema,
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
