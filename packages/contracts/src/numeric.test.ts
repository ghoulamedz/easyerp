import { describe, expect, it } from 'vitest';
import {
  decimalSchema,
  formatAmount,
  INTEGER_DIGITS,
  MAX_RATE,
  money,
  moneySchema,
  positiveDecimalSchema,
  quantity,
  quantitySchema,
  rate,
  rateSchema,
} from './numeric.js';

describe('moneySchema', () => {
  it('accepts an exact decimal within numeric(18,3)', () => {
    expect(moneySchema.parse('0')).toBe('0');
    expect(moneySchema.parse('1234.5')).toBe('1234.5');
    expect(moneySchema.parse('-0.001')).toBe('-0.001');
    expect(moneySchema.parse('999999999999999.999')).toBe('999999999999999.999');
  });

  it('rejects a fourth fractional digit instead of letting the database truncate it', () => {
    expect(moneySchema.safeParse('1.2345').success).toBe(false);
    expect(moneySchema.safeParse('0.0001').success).toBe(false);
  });

  it(`rejects more than ${INTEGER_DIGITS} integer digits`, () => {
    expect(moneySchema.safeParse('1'.repeat(INTEGER_DIGITS + 1)).success).toBe(false);
  });

  it('rejects JSON number syntax, exponents and blanks', () => {
    for (const invalid of ['1e3', ' 1', '1 ', '', '1,5', '1.2.3', 'NaN', '+1', 'Infinity']) {
      expect(moneySchema.safeParse(invalid).success, invalid).toBe(false);
    }
  });
});

describe('quantitySchema', () => {
  it('accepts a strictly positive decimal', () => {
    expect(quantitySchema.parse('1')).toBe('1');
    expect(quantitySchema.parse('0.001')).toBe('0.001');
  });

  it('rejects zero, because a document line of nothing is not a line', () => {
    expect(quantitySchema.safeParse('0').success).toBe(false);
    expect(quantitySchema.safeParse('0.000').success).toBe(false);
  });

  it('rejects a negative quantity', () => {
    expect(quantitySchema.safeParse('-1').success).toBe(false);
  });
});

describe('rateSchema', () => {
  it('accepts tax rates', () => {
    expect(rateSchema.parse('0')).toBe('0');
    expect(rateSchema.parse('7')).toBe('7');
    expect(rateSchema.parse('19')).toBe('19');
    expect(rateSchema.parse('13.5')).toBe('13.5');
  });

  it(`rejects a rate above ${MAX_RATE} percent without using a float comparison`, () => {
    expect(rateSchema.safeParse('100').success).toBe(true);
    expect(rateSchema.safeParse('100.000').success).toBe(true);
    expect(rateSchema.safeParse('100.001').success).toBe(false);
    expect(rateSchema.safeParse('101').success).toBe(false);
    expect(rateSchema.safeParse('1000').success).toBe(false);
  });
});

describe('parse helpers', () => {
  it('return branded values or throw', () => {
    expect(money('12.340')).toBe('12.340');
    expect(quantity('2')).toBe('2');
    expect(rate('19')).toBe('19');
    expect(() => money('1.2345')).toThrow();
  });
});

describe('formatAmount', () => {
  it('keeps every stored decimal place so a receipt never hides precision', () => {
    expect(formatAmount('1234.5', 'en-US')).toBe('1,234.500');
    expect(formatAmount('0', 'en-US')).toBe('0.000');
  });

  it('formats exactly, without a float round trip', () => {
    // 0.1 + 0.2 in binary floating point is 0.30000000000000004.
    expect(formatAmount('0.30000000000000004', 'en-US')).toBe('0.300');
  });
});

describe('decimalSchema', () => {
  it('is the single gate both money and quantity go through', () => {
    expect(decimalSchema.safeParse('1.001').success).toBe(true);
    expect(positiveDecimalSchema.safeParse('-0.001').success).toBe(false);
  });
});
