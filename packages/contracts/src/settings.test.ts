/**
 * Settings contracts (ADR 0013). These schemas are the wire shape of every
 * Administrator configuration screen, so the interesting properties to pin are
 * the ones a client typo would otherwise reach the database as.
 */

import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_TYPES,
  MODULES,
  MODULE_BY_DOCUMENT_TYPE,
  businessProfileUpdateSchema,
  labelUpsertSchema,
  moduleCodeSchema,
  numberPatternUpdateSchema,
  taxRateUpdateSchema,
  unitUpdateSchema,
} from './index.js';

describe('businessProfileUpdateSchema', () => {
  const patch = { displayName: 'SGT', vatRegime: 'EXEMPT' };

  it('accepts a partial patch', () => {
    expect(businessProfileUpdateSchema.parse(patch).vatRegime).toBe('EXEMPT');
  });

  it('refuses an empty patch, naming the no-op as a client bug', () => {
    expect(businessProfileUpdateSchema.safeParse({}).success).toBe(false);
  });

  it('refuses an unknown field, so a screen typo is never dropped', () => {
    expect(businessProfileUpdateSchema.safeParse({ ...patch, logo_file: 'x' }).success).toBe(false);
  });

  it('refuses a regime outside the two the product knows', () => {
    expect(businessProfileUpdateSchema.safeParse({ vatRegime: 'REDUCED' }).success).toBe(false);
  });

  it('refuses a country code that is not exactly two uppercase letters', () => {
    expect(businessProfileUpdateSchema.safeParse({ countryCode: 'tun' }).success).toBe(false);
  });

  it('accepts null to clear an optional particular', () => {
    expect(businessProfileUpdateSchema.parse({ phone: null }).phone).toBeNull();
  });
});

describe('taxRateUpdateSchema', () => {
  it('accepts a retirement', () => {
    expect(taxRateUpdateSchema.parse({ isActive: false }).isActive).toBe(false);
  });

  it('accepts rate changes as exact decimals', () => {
    expect(taxRateUpdateSchema.parse({ rate: '13.000' }).rate).toBe('13.000');
  });

  it('refuses a rate with more than three decimals, so numeric(18,3) is never truncated', () => {
    expect(taxRateUpdateSchema.safeParse({ rate: '19.0001' }).success).toBe(false);
  });

  it('refuses an unlisted field', () => {
    expect(taxRateUpdateSchema.safeParse({ delete: true }).success).toBe(false);
  });
});

describe('unitUpdateSchema', () => {
  it('accepts a retirement and a precision change in one call', () => {
    const patch = unitUpdateSchema.parse({ allowsFraction: false, isActive: false });
    expect(patch.allowsFraction).toBe(false);
    expect(patch.isActive).toBe(false);
  });
});

describe('numberPatternUpdateSchema', () => {
  it('accepts a pattern and its padding', () => {
    const patch = numberPatternUpdateSchema.parse({ pattern: 'FA-{year}-{seq}', padding: 5 });
    expect(patch.padding).toBe(5);
  });

  it('refuses a pattern without the sequence token, because numbers cannot be rendered', () => {
    expect(numberPatternUpdateSchema.safeParse({ pattern: 'FA-2026', padding: 4 }).success).toBe(
      false,
    );
  });

  it('refuses a padding outside the stored range', () => {
    expect(
      numberPatternUpdateSchema.safeParse({ pattern: 'FA-{year}-{seq}', padding: 0 }).success,
    ).toBe(false);
    expect(
      numberPatternUpdateSchema.safeParse({ pattern: 'FA-{year}-{seq}', padding: 13 }).success,
    ).toBe(false);
  });

  it('refuses an unknown field', () => {
    expect(
      numberPatternUpdateSchema.safeParse({ pattern: 'FA-{year}-{seq}', padding: 4, code: 'X' })
        .success,
    ).toBe(false);
  });
});

describe('labelUpsertSchema', () => {
  it('accepts an override in any of the three locales', () => {
    for (const locale of ['fr', 'en', 'ar'] as const) {
      const parsed = labelUpsertSchema.parse({
        entityType: 'DOCUMENT',
        entityCode: 'field.number',
        locale,
        value: 'N°',
      });
      expect(parsed.locale).toBe(locale);
    }
  });

  it('refuses a fourth locale, because three ship together or not at all', () => {
    expect(
      labelUpsertSchema.safeParse({
        entityType: 'DOCUMENT',
        entityCode: 'field.number',
        locale: 'de',
        value: 'Nr.',
      }).success,
    ).toBe(false);
  });

  it('allows the empty string, which deletes the override', () => {
    expect(
      labelUpsertSchema.parse({
        entityType: 'DOCUMENT',
        entityCode: 'field.number',
        locale: 'fr',
        value: '',
      }).value,
    ).toBe('');
  });

  it('refuses an entity type outside the two that carry labels', () => {
    expect(
      labelUpsertSchema.safeParse({
        entityType: 'ITEM',
        entityCode: 'x',
        locale: 'fr',
        value: 'y',
      }).success,
    ).toBe(false);
  });
});

describe('Modules', () => {
  it('lists the six switchable Modules', () => {
    expect([...MODULES].sort()).toEqual([
      'E_INVOICING',
      'FINANCE',
      'INVENTORY',
      'PRODUCTION',
      'PURCHASING',
      'SALES',
    ]);
  });

  it('maps every Document type to exactly one Module', () => {
    expect(Object.keys(MODULE_BY_DOCUMENT_TYPE).sort()).toEqual([...DOCUMENT_TYPES].sort());
    for (const module of Object.values(MODULE_BY_DOCUMENT_TYPE)) {
      expect(moduleCodeSchema.safeParse(module).success).toBe(true);
    }
  });

  it('groups the sales fulfilment types under SALES and the fiscal ones under FINANCE', () => {
    expect(MODULE_BY_DOCUMENT_TYPE.SALES_ORDER).toBe('SALES');
    expect(MODULE_BY_DOCUMENT_TYPE.DELIVERY_NOTE).toBe('SALES');
    expect(MODULE_BY_DOCUMENT_TYPE.CUSTOMER_INVOICE).toBe('FINANCE');
    expect(MODULE_BY_DOCUMENT_TYPE.CREDIT_NOTE).toBe('FINANCE');
    expect(MODULE_BY_DOCUMENT_TYPE.PURCHASE_ORDER).toBe('PURCHASING');
    expect(MODULE_BY_DOCUMENT_TYPE.GOODS_RECEIPT).toBe('PURCHASING');
    expect(MODULE_BY_DOCUMENT_TYPE.PRODUCTION_ORDER).toBe('PRODUCTION');
  });
});
