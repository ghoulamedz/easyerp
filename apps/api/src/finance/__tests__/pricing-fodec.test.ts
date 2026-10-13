/**
 * FODEC-aware pricing (docs/tunisia-fiscal-research.md §2, docs/fiscal-build-plan.md §0).
 *
 * The canonical order per line: net = qty × unitPrice (rounded once, HALF_UP) →
 * fodec = 1% of the net for a subject line (rounded once) → VAT base = net +
 * fodec → tax = base × rate (rounded once) → gross = base + tax. Totals sum the
 * rounded line figures; the FODEC total is never recomputed from summed totals.
 */

import { describe, expect, it } from 'vitest';
import { Amount } from '../amount.js';
import { priceLine, sumLines } from '../pricing.js';

function priced(
  quantity: string,
  unitPrice: string,
  taxRate: string,
  fodecSubject?: boolean,
) {
  return { ...priceLine({ quantity, unitPrice, taxRate, fodecSubject }), taxRate };
}

describe('priceLine with FODEC', () => {
  it('prices FODEC on the HT net and VAT on net plus FODEC', () => {
    // 2 × 100.000 = 200.000 net; FODEC 1% = 2.000; base 202.000; VAT 19% = 38.380.
    const line = priceLine({ quantity: '2', unitPrice: '100.000', taxRate: '19', fodecSubject: true });
    expect(line.net.toString()).toBe('200.000');
    expect(line.fodec.toString()).toBe('2.000');
    expect(line.tax.toString()).toBe('38.380');
    expect(line.gross.toString()).toBe('240.380');
  });

  it('prices a non-subject line exactly as before: zero FODEC, VAT on the net alone', () => {
    for (const input of [
      { quantity: '1', unitPrice: '500.000', taxRate: '19' },
      { quantity: '1', unitPrice: '500.000', taxRate: '19', fodecSubject: false },
    ]) {
      const line = priceLine(input);
      expect(line.net.toString()).toBe('500.000');
      expect(line.fodec.toString()).toBe('0.000');
      expect(line.tax.toString()).toBe('95.000');
      expect(line.gross.toString()).toBe('595.000');
    }
  });

  it('rounds the FODEC figure once, half up, before it joins the VAT base', () => {
    // Net 0.050; FODEC 1% = 0.0005, kept as 0.001 half-up rather than truncated.
    // Base 0.051; VAT 19% = 0.00969, rounded once to 0.010; gross 0.061.
    const line = priceLine({ quantity: '1', unitPrice: '0.050', taxRate: '19', fodecSubject: true });
    expect(line.net.toString()).toBe('0.050');
    expect(line.fodec.toString()).toBe('0.001');
    expect(line.tax.toString()).toBe('0.010');
    expect(line.gross.toString()).toBe('0.061');
  });
});

describe('sumLines with FODEC', () => {
  it('sums a mixed multi-rate document: subject and non-subject lines side by side', () => {
    const totals = sumLines([
      priced('2', '100.000', '19', true),
      priced('1', '100.000', '7', false),
    ]);
    expect(totals.net.toString()).toBe('300.000');
    expect(totals.fodec.toString()).toBe('2.000');
    expect(totals.tax.toString()).toBe('45.380');
    expect(totals.gross.toString()).toBe('347.380');
  });

  it('sums rounded line figures instead of recomputing FODEC from the summed net', () => {
    // Each 0.050 line rounds its own FODEC 0.0005 up to 0.001. Recomputing from
    // the summed net (0.100 × 1% = 0.001) would lose a millime — the classic
    // round-at-the-end defect this total must not reproduce.
    const lines = [priced('1', '0.050', '19', true), priced('1', '0.050', '19', true)];
    const totals = sumLines(lines);
    expect(lines.map((line) => line.fodec.toString())).toEqual(['0.001', '0.001']);
    expect(totals.net.toString()).toBe('0.100');
    expect(totals.fodec.toString()).toBe('0.002');
    expect(totals.tax.toString()).toBe('0.020');
    expect(totals.gross.toString()).toBe('0.122');
  });

  it('reconciles every total: net plus FODEC plus tax equals gross', () => {
    const totals = sumLines([
      priced('2', '100.000', '19', true),
      priced('1', '100.000', '7', false),
      priced('3', '19.990', '13', true),
    ]);
    const recomposed = totals.net.plus(totals.fodec).plus(totals.tax);
    expect(recomposed.equals(totals.gross)).toBe(true);
    expect(totals.fodec.isZero()).toBe(false);
  });

  it('totals zero FODEC for a document with no subject line', () => {
    const totals = sumLines([priced('2', '100.000', '19'), priced('1', '50.000', '13')]);
    expect(totals.fodec.toString()).toBe('0.000');
    expect(totals.tax.toString()).toBe('44.500');
    expect(totals.gross.toString()).toBe('294.500');
  });

  it('keeps an empty document at zero FODEC rather than throwing', () => {
    const totals = sumLines([]);
    expect(totals.fodec.toString()).toBe('0.000');
    expect(totals.fodec).toBeInstanceOf(Amount);
  });
});
