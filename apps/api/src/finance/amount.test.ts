import { describe, expect, it } from 'vitest';
import { Amount, amount, roundToScale, sum } from './amount.js';
import { priceLine, sumLines } from './pricing.js';
import Decimal from 'decimal.js';

describe('Amount', () => {
  it('parses an exact decimal string and always renders the column scale', () => {
    expect(amount('1.5').toString()).toBe('1.500');
    expect(amount('1').toString()).toBe('1.000');
    expect(amount('0').toString()).toBe('0.000');
    expect(amount('-0.001').toString()).toBe('-0.001');
  });

  it('refuses a value that could not live in a numeric(18,3) column', () => {
    expect(() => amount('1.2345')).toThrow();
    expect(() => amount('1e3')).toThrow();
    expect(() => amount('')).toThrow();
  });

  it('refuses a JavaScript float at the door, where the damage is still reversible', () => {
    // 0.1 + 0.2 !== 0.3 in binary floating point. Amount.parse takes a string on
    // purpose; the type system refuses a number.
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(() => Amount.parse(String(0.1 + 0.2))).toThrow();
  });

  it('adds and subtracts exactly, with no drift', () => {
    const total = amount('0.100').plus(amount('0.200')).plus(amount('0.300'));
    expect(total.toString()).toBe('0.600');
    expect(total.minus(amount('0.600')).isZero()).toBe(true);
  });

  it('sums many small amounts without losing a single unit', () => {
    const cents = Array.from({ length: 1000 }, () => amount('0.001'));
    expect(sum(cents).toString()).toBe('1.000');
  });

  it('compares numerically, so a shorter literal equals its padded form', () => {
    expect(amount('1').equals(amount('1.000'))).toBe(true);
    expect(amount('1').compare(amount('1.001'))).toBe(-1);
    expect(amount('2').isGreaterThan(amount('1.999'))).toBe(true);
  });
});

describe('rounding', () => {
  it('rounds half up, as a tax authority does', () => {
    expect(roundToScale(new Decimal('0.0005')).toFixed(3)).toBe('0.001');
    expect(roundToScale(new Decimal('0.0015')).toFixed(3)).toBe('0.002');
    expect(roundToScale(new Decimal('0.0045')).toFixed(3)).toBe('0.005');
  });

  it('rounds down below the midpoint, including on a negative amount', () => {
    expect(roundToScale(new Decimal('0.0004')).toFixed(3)).toBe('0.000');
    expect(roundToScale(new Decimal('-0.0005')).toFixed(3)).toBe('-0.001');
  });

  it('rounds a product to the scale instead of letting it drift', () => {
    expect(amount('1.005').timesQuantity('1').toString()).toBe('1.005');
    expect(amount('2.500').timesQuantity('1.5').toString()).toBe('3.750');
    expect(amount('1.001').timesQuantity('1.001').toString()).toBe('1.002');
  });
});

describe('priceLine', () => {
  it('derives net, tax and gross from the Item price and rate', () => {
    const line = priceLine({ quantity: '3', unitPrice: '100.000', taxRate: '19' });
    expect(line.net.toString()).toBe('300.000');
    expect(line.tax.toString()).toBe('57.000');
    expect(line.gross.toString()).toBe('357.000');
  });

  it('handles a fractional quantity', () => {
    const line = priceLine({ quantity: '2.5', unitPrice: '19.990', taxRate: '19' });
    expect(line.net.toString()).toBe('49.975');
    expect(line.tax.toString()).toBe('9.495');
    expect(line.gross.toString()).toBe('59.470');
  });

  it('applies an exempt rate as a real zero, not an absence', () => {
    const line = priceLine({ quantity: '1', unitPrice: '500.000', taxRate: '0' });
    expect(line.tax.toString()).toBe('0.000');
    expect(line.gross.toString()).toBe('500.000');
  });

  it('rounds a half-case up rather than truncating it away', () => {
    // 0.001 at 50% is exactly 0.0005: half up keeps it, truncation loses it.
    const line = priceLine({ quantity: '1', unitPrice: '0.001', taxRate: '50' });
    expect(line.tax.toString()).toBe('0.001');
  });
});

describe('sumLines', () => {
  it('sums the rounded lines, so the total equals what the user sees on them', () => {
    const lines = [
      { ...priceLine({ quantity: '1', unitPrice: '0.001', taxRate: '50' }), taxRate: '50' },
      { ...priceLine({ quantity: '1', unitPrice: '0.001', taxRate: '50' }), taxRate: '50' },
      { ...priceLine({ quantity: '1', unitPrice: '0.001', taxRate: '50' }), taxRate: '50' },
    ];
    const totals = sumLines(lines);
    expect(lines.map((line) => line.tax.toString())).toEqual(['0.001', '0.001', '0.001']);
    expect(totals.tax.toString()).toBe('0.003');
  });

  it('attributes tax per rate so the invoice can print one line per rate', () => {
    const totals = sumLines([
      { ...priceLine({ quantity: '2', unitPrice: '100.000', taxRate: '19' }), taxRate: '19' },
      { ...priceLine({ quantity: '1', unitPrice: '100.000', taxRate: '7' }), taxRate: '7' },
    ]);

    expect(totals.net.toString()).toBe('300.000');
    expect(totals.tax.toString()).toBe('45.000');
    expect(totals.gross.toString()).toBe('345.000');
    expect(totals.taxByRate.map((entry) => [entry.rate, entry.amount.toString()])).toEqual([
      ['19', '38.000'],
      ['7', '7.000'],
    ]);
  });

  it('adds the same rate together when it appears on several lines', () => {
    const totals = sumLines([
      { ...priceLine({ quantity: '1', unitPrice: '10.000', taxRate: '19' }), taxRate: '19' },
      { ...priceLine({ quantity: '2', unitPrice: '10.000', taxRate: '19' }), taxRate: '19' },
    ]);
    expect(totals.taxByRate).toHaveLength(1);
    expect(totals.taxByRate[0]?.amount.toString()).toBe('5.700');
  });

  it('returns zeros for an empty document rather than throwing', () => {
    const totals = sumLines([]);
    expect(totals.net.toString()).toBe('0.000');
    expect(totals.tax.toString()).toBe('0.000');
    expect(totals.taxByRate).toEqual([]);
  });
});
