/**
 * Setup contract (ADR 0012).
 *
 * The shape of the one unauthenticated write in the product deserves its own
 * tests, because a schema that silently dropped a field would break every
 * Business from the first day rather than one day in a particular client.
 */

import { describe, expect, it } from 'vitest';
import { PERMISSION_CATALOG, setupRequestSchema } from './index.js';

const validRequest = {
  token: 'operator-supplied-token',
  business: {
    legalName: 'Société Générale de Tutorat',
    displayName: 'SGT',
    taxIdentifier: '1234567/A/M/000',
    countryCode: 'TN',
    vatRegime: 'STANDARD',
  },
  administrator: {
    email: 'admin@sgt.example',
    name: 'Amina Ben Salah',
    password: 'correct horse battery staple',
  },
  units: [{ code: 'PCS', allowsFraction: false }],
  taxRates: [{ code: 'STANDARD_19', rate: '19' }],
};

describe('setupRequestSchema', () => {
  it('accepts the minimum complete request', () => {
    const parsed = setupRequestSchema.parse(validRequest);
    const [unit] = parsed.units;
    expect(parsed.business.currency).toBe('TND');
    expect(unit?.allowsFraction).toBe(false);
  });

  it('defaults allowsFraction and currency when omitted', () => {
    const parsed = setupRequestSchema.parse({
      ...validRequest,
      units: [{ code: 'KG' }],
      business: { ...validRequest.business, currency: undefined },
    });
    const [unit] = parsed.units;
    expect(unit?.allowsFraction).toBe(true);
    expect(parsed.business.currency).toBe('TND');
  });

  it('refuses an unknown field, so a client typo is never silently dropped', () => {
    const result = setupRequestSchema.safeParse({ ...validRequest, rogueField: true });
    expect(result.success).toBe(false);
  });

  it('refuses zero Units', () => {
    const result = setupRequestSchema.safeParse({ ...validRequest, units: [] });
    expect(result.success).toBe(false);
  });

  it('refuses a NaN-shaped tax rate', () => {
    const result = setupRequestSchema.safeParse({
      ...validRequest,
      taxRates: [{ code: 'STANDARD_19', rate: '19.0001' }],
    });
    expect(result.success).toBe(false);
  });

  it('allows a zero tax rate, which is legitimate for exempt goods', () => {
    const result = setupRequestSchema.safeParse({
      ...validRequest,
      taxRates: [{ code: 'EXEMPT', rate: '0' }],
    });
    expect(result.success).toBe(true);
  });

  it('allows zero tax rates, leaving the STANDARD-requires-one rule to the service', () => {
    const result = setupRequestSchema.safeParse({ ...validRequest, taxRates: [] });
    expect(result.success).toBe(true);
  });

  it('requires both STANDARD and EXEMPT to be accepted VAT regimes', () => {
    for (const vatRegime of ['STANDARD', 'EXEMPT']) {
      const result = setupRequestSchema.safeParse({
        ...validRequest,
        business: { ...validRequest.business, vatRegime },
      });
      expect(result.success).toBe(true);
    }
    expect(
      setupRequestSchema.safeParse({
        ...validRequest,
        business: { ...validRequest.business, vatRegime: 'REDUCED' },
      }).success,
    ).toBe(false);
  });
});

describe('bom permission group', () => {
  it('exists in the catalog a Production Order can consume', () => {
    expect(PERMISSION_CATALOG).toHaveProperty('bom');
    expect(PERMISSION_CATALOG.bom).toContain('bom:read');
    expect(PERMISSION_CATALOG.bom).toContain('bom:create');
  });
});
