/**
 * Payments and the Customer's balance (spec 001 stories 63–69, ADR 0016, ADR 0003).
 *
 * A Payment is money received. It is *not* a Document: it has no number, no
 * status and no archive. Its `allocations` assign part of the payment to issued
 * fiscal Documents — an allocation to a Customer Invoice settles what was
 * billed, an allocation to a Credit Note is a refund paid back out. The excess
 * of a Payment over its allocations is unallocated credit.
 *
 * The Customer's `outstanding` (CONTEXT.md — "always derived, never stored") is
 * the additive identity over the two signed sources: what was invoiced, minus
 * what was credited, minus what Payments settled on Invoices, plus the refunds
 * returned against Credit Notes.
 */

import { z } from 'zod';
import { documentTypeSchema } from './documents.js';
import { moneySchema, positiveMoneySchema } from './numeric.js';

/** One allocation of a Payment to a Document, as a client submits it. */
export const paymentAllocationInputSchema = z.strictObject({
  documentId: z.string().min(1),
  /** Strictly positive: the fraction of the Payment assigned to this Document. */
  amount: positiveMoneySchema,
});
export type PaymentAllocationInput = z.infer<typeof paymentAllocationInputSchema>;

/**
 * What a client submits when recording a Payment. `amount` is strictly positive
 * and the server refuses `sum(allocations) > amount`. `allocations` is optional:
 * a Payment may arrive with none yet, and the remainder is unallocated credit.
 */
export const draftPaymentSchema = z.strictObject({
  businessId: z.string().min(1),
  partyId: z.string().min(1),
  amount: positiveMoneySchema,
  /** When the money arrived. Defaults to now when absent. */
  receivedAt: z.string().datetime().optional(),
  method: z.string().max(32).optional(),
  reference: z.string().max(100).optional(),
  note: z.string().max(500).optional(),
  allocations: z.array(paymentAllocationInputSchema).default([]),
});
export type DraftPayment = z.infer<typeof draftPaymentSchema>;

/** An allocation as served: the Document it hit, so a balance explains itself. */
export const paymentAllocationSchema = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  documentType: documentTypeSchema,
  documentNumber: z.string().min(1).nullable(),
  amount: moneySchema,
});
export type PaymentAllocation = z.infer<typeof paymentAllocationSchema>;

/**
 * A Payment as the API returns it. `unallocatedCredit` is `amount` minus the
 * sum of its allocations, asserted by the schema itself so the contract cannot
 * serve a Payment whose allocations do not reconcile — even before the service
 * records it.
 */
export const paymentSchema = z
  .object({
    id: z.string().min(1),
    businessId: z.string().min(1),
    partyId: z.string().min(1),
    amount: moneySchema,
    receivedAt: z.string().datetime(),
    method: z.string().nullable(),
    reference: z.string().nullable(),
    note: z.string().nullable(),
    unallocatedCredit: moneySchema,
    createdAt: z.string().datetime(),
    allocations: z.array(paymentAllocationSchema),
  })
  .superRefine((payment, context) => {
    // Exact integer arithmetic on the 3-decimal strings, so no float is involved
    // in asserting that a served Payment reconciles.
    const allocated = payment.allocations.reduce((total, a) => total + scaledMoney(a.amount), 0n);
    const unallocated = scaledMoney(payment.amount) - allocated;

    if (unallocated !== scaledMoney(payment.unallocatedCredit)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'unallocatedCredit must equal amount minus the sum of allocations; the payment does not reconcile',
        path: ['unallocatedCredit'],
      });
    }
    if (unallocated < 0n) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'the allocations exceed the payment amount; over-allocation is refused',
        path: ['allocations'],
      });
    }
  });
export type Payment = z.infer<typeof paymentSchema>;

/** The exact integer count of millimes in a 3-decimal money string. */
function scaledMoney(value: string): bigint {
  const negative = value.startsWith('-');
  const [whole = '', fraction = ''] = value.replace('-', '').split('.');
  const millimes = BigInt(whole || '0') * 1000n + BigInt((fraction + '00').slice(0, 3) || '0');
  return negative ? -millimes : millimes;
}

/**
 * What a Customer owes, derived on read (CONTEXT.md). The components are named
 * so a screen or a report can show the arithmetic, and `outstanding` is the one
 * number the business acts on; it may be negative when a Customer is owed money.
 */
export const partyBalanceSchema = z.object({
  partyId: z.string().min(1),
  /** The sum of issued Customer Invoices' gross amounts, a positive figure. */
  invoiced: moneySchema,
  /** The sum of issued Credit Notes' magnitudes, a positive figure. */
  credited: moneySchema,
  /** The amount Payments settled against Customer Invoices. */
  allocatedToInvoices: moneySchema,
  /** The amount of refunds settled against Credit Notes. */
  allocatedToCreditNotes: moneySchema,
  /** invoiced − credited − allocatedToInvoices + allocatedToCreditNotes. */
  outstanding: moneySchema,
  /** The sum of amounts received that no Document absorbs yet. */
  unallocatedCredit: moneySchema,
});
export type PartyBalance = z.infer<typeof partyBalanceSchema>;

/**
 * A Payment as served to the API. This is a read-only representation, stripped
 * of the database fields (`id`, `createdAt`, `unallocatedCredit`) and enriched
 * with `issuedAt` and a `party` reference for display.
 */
export const paymentSummarySchema = z.object({
  partyId: z.string().min(1),
  amount: moneySchema,
  currency: z.string().min(1),
  status: z.enum(['ISSUED', 'PAID', 'CANCELLED']),
  number: z.string().min(1),
  issuedAt: z.string().datetime().nullable(),
  allocatedTo: z.array(
    z.object({
      id: z.string().min(1),
      type: z.string().min(1),
      number: z.string().min(1),
      amount: moneySchema,
      currency: z.string().min(1),
      allocatedAmount: moneySchema,
    })
  ),
  party: z.object({
    id: z.string().min(1),
    name: z.string().max(500),
    code: z.string().max(32),
  }),
});
export type PaymentSummary = z.infer<typeof paymentSummarySchema>;
