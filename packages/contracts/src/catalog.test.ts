/**
 * Catalog contracts (spec 001 stories 25–32): the wire shape of the Item and
 * Party screens, and the pagination envelope every long collection returns.
 */

import { describe, expect, it } from 'vitest';
import {
  itemInputSchema,
  itemSchema,
  pageQuerySchema,
  paginatedSchema,
  partyInputSchema,
} from './index.js';

describe('pageQuerySchema', () => {
  it('defaults to the first page of 25', () => {
    const parsed = pageQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(25);
    expect(parsed.q).toBeUndefined();
  });

  it('coerces strings as the URL transport sends them', () => {
    expect(pageQuerySchema.parse({ page: '2', pageSize: '50' })).toMatchObject({
      page: 2,
      pageSize: 50,
    });
  });

  it('refuses a page size above the cap, so one query cannot scan the catalog', () => {
    expect(pageQuerySchema.safeParse({ pageSize: '101' }).success).toBe(false);
  });

  it('refuses zero and negative pages', () => {
    expect(pageQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(pageQuerySchema.safeParse({ pageSize: '-1' }).success).toBe(false);
  });
});

describe('paginatedSchema', () => {
  it('wraps the concrete item schema in the envelope', () => {
    const items = paginatedSchema(itemSchema);
    const parsed = items.parse({
      items: [
        {
          id: 'i1',
          code: 'SAV-001',
          name: 'Carnet',
          description: null,
          itemType: 'FINISHED_GOOD',
          baseUnitId: 'u1',
          purchaseUnitId: null,
          saleUnitId: null,
          taxRateId: 'r1',
          fodecSubject: false,
          salePrice: '12.500',
          purchasePrice: '8.000',
          reorderPoint: null,
          isService: false,
          isActive: true,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 25,
    });
    expect(parsed.total).toBe(1);
    expect(parsed.items[0]?.code).toBe('SAV-001');
  });
});

describe('itemInputSchema', () => {
  it('accepts an item with prices, because an Item owns its prices (ADR 0005)', () => {
    const parsed = itemInputSchema.parse({
      code: 'SAV-001',
      name: 'Carnet de lettres',
      description: null,
      itemType: 'FINISHED_GOOD',
      baseUnitId: 'u1',
      purchaseUnitId: null,
      saleUnitId: null,
      taxRateId: 'r1',
      salePrice: '12.500',
      purchasePrice: '8.000',
      reorderPoint: '5',
      isActive: true,
      customFields: { colour: 'red' },
    });
    expect(parsed.salePrice).toBe('12.500');
    expect(parsed.customFields).toMatchObject({ colour: 'red' });
  });

  it('refuses a price that is not an exact decimal string', () => {
    expect(
      itemInputSchema.safeParse({
        code: 'X',
        name: 'X',
        itemType: 'SERVICE',
        baseUnitId: 'u1',
        taxRateId: 'r1',
        salePrice: 12.5,
        purchasePrice: '0',
        isActive: true,
      }).success,
    ).toBe(false);
  });

  it('defaults an Item to not FODEC-subject unless the client says so', () => {
    const parsed = itemInputSchema.parse({
      code: 'SVC-1',
      name: 'Maintenance',
      description: null,
      itemType: 'SERVICE',
      baseUnitId: 'u1',
      purchaseUnitId: null,
      saleUnitId: null,
      taxRateId: 'r1',
      salePrice: '100',
      purchasePrice: '0',
      reorderPoint: null,
      isActive: true,
    });
    expect(parsed.fodecSubject).toBe(false);
  });

  it('accepts an explicitly FODEC-subject Item', () => {
    const parsed = itemInputSchema.parse({
      code: 'IND-001',
      name: 'Tôle galvanisée',
      description: null,
      itemType: 'FINISHED_GOOD',
      baseUnitId: 'u1',
      purchaseUnitId: null,
      saleUnitId: null,
      taxRateId: 'r1',
      fodecSubject: true,
      salePrice: '100',
      purchasePrice: '80',
      reorderPoint: null,
      isActive: true,
    });
    expect(parsed.fodecSubject).toBe(true);
    expect(itemSchema.parse({ ...parsed, id: 'i1', isService: false }).fodecSubject).toBe(true);
  });

  it('derives no isService field from the client; the server computes it', () => {
    const parsed = itemInputSchema.parse({
      code: 'SVC-1',
      name: 'Maintenance',
      description: null,
      itemType: 'SERVICE',
      baseUnitId: 'u1',
      purchaseUnitId: null,
      saleUnitId: null,
      taxRateId: 'r1',
      salePrice: '100',
      purchasePrice: '0',
      reorderPoint: null,
      isActive: true,
    });
    expect('isService' in parsed).toBe(false);
  });

  it('refuses an unknown field, so a screen typo is never dropped', () => {
    expect(
      itemInputSchema.safeParse({
        code: 'X',
        name: 'X',
        description: null,
        itemType: 'SERVICE',
        baseUnitId: 'u1',
        purchaseUnitId: null,
        saleUnitId: null,
        taxRateId: 'r1',
        salePrice: '100',
        purchasePrice: '0',
        reorderPoint: null,
        isActive: true,
        taxRate_id: 'r2',
      }).success,
    ).toBe(false);
  });
});

describe('partyInputSchema', () => {
  const base = {
    code: 'CUST-01',
    name: 'Mouna Hariz',
    roles: ['CUSTOMER'],
    taxIdentifier: '1234567',
    email: 'mouna@example.com',
    phone: null,
    address: null,
    city: 'Tunis',
    countryCode: 'TN',
    isActive: true,
  };

  it('accepts a party carrying commercial terms for the CUSTOMER role', () => {
    const parsed = partyInputSchema.parse({
      ...base,
      customerTerms: { paymentTermDays: 30, creditLimit: '5000.000', deliveryAddress: 'Rue 1' },
    });
    expect(parsed.customerTerms?.paymentTermDays).toBe(30);
    expect(parsed.customerTerms?.creditLimit).toBe('5000.000');
  });

  it('refuses a credit limit that is not money and a term day beyond a year', () => {
    expect(
      partyInputSchema.safeParse({
        ...base,
        customerTerms: { paymentTermDays: 366, creditLimit: 'x', deliveryAddress: null },
      }).success,
    ).toBe(false);
  });

  it('refuses a party with no roles, because a record with none is not a counterparty', () => {
    expect(partyInputSchema.safeParse({ ...base, roles: [] }).success).toBe(false);
  });

  it('refuses an unknown role, and an unknown field is dropped only with consent', () => {
    expect(partyInputSchema.safeParse({ ...base, roles: ['AGENT'] }).success).toBe(false);
    expect(partyInputSchema.safeParse({ ...base, vat_number: 'x' }).success).toBe(false);
  });
});
