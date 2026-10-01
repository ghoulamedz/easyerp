/**
 * The money value object.
 *
 * Two rules are enforced by construction rather than by convention (ADR 0005):
 * a value can only enter as an exact decimal string or a `Decimal`, so a
 * JavaScript float can never reach an arithmetic path; and every product is
 * rounded once, HALF_UP, to the column scale.
 */

import Decimal from 'decimal.js';
import { SCALE, type Money, money as parseMoney } from '@easyerp/contracts';

/** HALF_UP: 0.005 becomes 0.01, not 0.00. Chosen because a tax authority rounds half up. */
export const ROUNDING_MODE = Decimal.ROUND_HALF_UP;

/** Round to the column scale. Every computed amount passes through here. */
export function roundToScale(value: Decimal): Decimal {
  return value.toDecimalPlaces(SCALE, ROUNDING_MODE);
}

export class Amount {
  private constructor(private readonly value: Decimal) {}

  /** Parse an untrusted string. Reuses the contract's schema, so the two cannot drift. */
  static parse(value: string): Amount {
    return new Amount(new Decimal(parseMoney(value)));
  }

  static of(value: Decimal): Amount {
    return new Amount(value);
  }

  static zero(): Amount {
    return new Amount(new Decimal(0));
  }

  plus(other: Amount): Amount {
    return new Amount(this.value.plus(other.value));
  }

  minus(other: Amount): Amount {
    return new Amount(this.value.minus(other.value));
  }

  negated(): Amount {
    return new Amount(this.value.negated());
  }

  /**
   * Multiply by a quantity, rounded to the column scale. Used for
   * `net = unitPrice × quantity`, where the product can carry more precision
   * than money does.
   */
  timesQuantity(quantity: string): Amount {
    return new Amount(roundToScale(this.value.times(quantity)));
  }

  /**
   * Apply a rate expressed in percent, rounded once. Used for
   * `tax = net × rate / 100`.
   */
  timesRate(rate: string): Amount {
    return new Amount(roundToScale(this.value.times(rate).dividedBy(100)));
  }

  divide(divisor: string): Amount {
    return new Amount(roundToScale(this.value.dividedBy(divisor)));
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isNegative(): boolean {
    return this.value.isNegative();
  }

  isGreaterThan(other: Amount): boolean {
    return this.value.greaterThan(other.value);
  }

  isLessThan(other: Amount): boolean {
    return this.value.lessThan(other.value);
  }

  /** Numeric comparison, so `1.0` equals `1.000`; string equality would not. */
  equals(other: Amount): boolean {
    return this.value.equals(other.value);
  }

  compare(other: Amount): -1 | 0 | 1 {
    return this.value.comparedTo(other.value) as -1 | 0 | 1;
  }

  toDecimal(): Decimal {
    return this.value;
  }

  /** Always `SCALE` decimals, so it round-trips a `numeric(18,3)` column exactly. */
  toString(): string {
    return this.value.toFixed(SCALE);
  }

  toMoney(): Money {
    return parseMoney(this.toString());
  }

  toJSON(): string {
    return this.toString();
  }
}

export function amount(value: string): Amount {
  return Amount.parse(value);
}

export function sum(values: readonly Amount[]): Amount {
  return values.reduce<Amount>((total, value) => total.plus(value), Amount.zero());
}
