import { describe, expect, it } from 'vitest';
import { draftPaymentSchema, paymentSchema, partyBalanceSchema } from './payments.js';

describe('draft payment', () => {
  it('rejects an amount that is not strictly positive money', () => {
    expect(
      draftPaymentSchema.safeParse({
        businessId: 'biz_1',
        partyId: 'cust_1',
        amount: '100.000',
      }).success,
    ).toBe(true);

    expect(
      draftPaymentSchema.safeParse({ businessId: 'biz_1', partyId: 'cust_1', amount: '0' }).success,
    ).toBe(false);
    expect(
      draftPaymentSchema.safeParse({ businessId: 'biz_1', partyId: 'cust_1', amount: '-5.000' })
        .success,
    ).toBe(false);
  });

  it('accepts a payment without allocations as unallocated credit', () => {
    const parsed = draftPaymentSchema.parse({
      businessId: 'biz_1',
      partyId: 'cust_1',
      amount: '600.000',
    });
    expect(parsed.allocations).toEqual([]);
  });

  it('rejects an allocation that is not strictly positive or that prices itself', () => {
    expect(
      draftPaymentSchema.safeParse({
        businessId: 'biz_1',
        partyId: 'cust_1',
        amount: '100.000',
        allocations: [{ documentId: 'inv_1', amount: '50.000' }],
      }).success,
    ).toBe(true);

    expect(
      draftPaymentSchema.safeParse({
        businessId: 'biz_1',
        partyId: 'cust_1',
        amount: '100.000',
        allocations: [{ documentId: 'inv_1', amount: '0' }],
      }).success,
    ).toBe(false);
    expect(
      draftPaymentSchema.safeParse({
        businessId: 'biz_1',
        partyId: 'cust_1',
        amount: '100.000',
        allocations: [{ documentId: 'inv_1', amount: '50.000', documentType: 'CUSTOMER_INVOICE' }],
      }).success,
    ).toBe(false);
  });

  it('is strict: a payment carrying its own outstanding would be a lie', () => {
    expect(
      draftPaymentSchema.safeParse({
        businessId: 'biz_1',
        partyId: 'cust_1',
        amount: '100.000',
        outstanding: '50.000',
      }).success,
    ).toBe(false);
  });
});

describe('payment response', () => {
  const payment = {
    id: 'pay_1',
    businessId: 'biz_1',
    partyId: 'cust_1',
    amount: '600.000',
    receivedAt: '2026-10-08T10:00:00.000Z',
    method: 'bank_transfer',
    reference: null,
    note: null,
    unallocatedCredit: '120.000',
    createdAt: '2026-10-08T10:00:00.000Z',
    allocations: [
      {
        id: 'a_1',
        documentId: 'inv_1',
        documentType: 'CUSTOMER_INVOICE',
        documentNumber: 'FA-2026-0001',
        amount: '480.000',
      },
    ],
  };

  it('carries the allocated documents and the unallocated remainder', () => {
    const parsed = paymentSchema.parse(payment);
    expect(parsed.unallocatedCredit).toBe('120.000');
    expect(parsed.allocations[0]?.documentNumber).toBe('FA-2026-0001');
  });

  it('rejects a payment whose allocations exceed its amount', () => {
    expect(paymentSchema.safeParse({ ...payment, unallocatedCredit: '-80.000' }).success).toBe(
      false,
    );
  });
});

describe('party balance', () => {
  it('derives outstanding with the corrected sign of each component', () => {
    const parsed = partyBalanceSchema.parse({
      partyId: 'cust_1',
      invoiced: '100.000',
      credited: '20.000',
      allocatedToInvoices: '60.000',
      allocatedToCreditNotes: '20.000',
      outstanding: '40.000',
      unallocatedCredit: '0.000',
    });
    expect(parsed.outstanding).toBe('40.000');
  });

  it('allows a negative outstanding: the Business owes the Customer', () => {
    const parsed = partyBalanceSchema.parse({
      partyId: 'cust_1',
      invoiced: '100.000',
      credited: '40.000',
      allocatedToInvoices: '100.000',
      allocatedToCreditNotes: '40.000',
      outstanding: '0.000',
      unallocatedCredit: '0.000',
    });
    expect(parsed.outstanding).toBe('0.000');
  });
});
