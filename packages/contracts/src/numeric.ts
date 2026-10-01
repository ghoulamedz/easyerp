/**
 * Decimal primitives shared by every numeric field in the product.
 *
 * Money and quantity are transported as exact decimal *strings*, never as JSON
 * numbers, because IEEE-754 doubles cannot represent 0.1 and an ERP that
 * accumulates 3-decimal amounts in doubles loses cents (ADR 0005).
 */

import { z } from 'zod';

/** Decimal places for money, quantity and rates alike. Mirrors `numeric(18,3)`. */
export const SCALE = 3;

/** Integer digits available in a `numeric(18,3)` column: 15 integer + 3 fractional. */
export const INTEGER_DIGITS = 15;

/** Upper bound of a tax rate expressed in percent (100% would be a data error). */
export const MAX_RATE = 100;

const DECIMAL_PATTERN = new RegExp(`^-?\\d{1,${INTEGER_DIGITS}}(\\.\\d{1,${SCALE}})?$`);

/**
 * A signed decimal with at most `INTEGER_DIGITS` integer digits and `SCALE`
 * fractional digits. Trailing zeros beyond the scale are rejected so that
 * `"1.2345"` can never reach a `numeric(18,3)` column and be silently truncated.
 */
export const decimalSchema = z
  .string()
  .regex(
    DECIMAL_PATTERN,
    `expected a decimal with at most ${INTEGER_DIGITS} integer digits and ${SCALE} fractional digits`,
  );

const nonNegativePattern = /^\d{1,15}(\.\d{1,3})?$/;
const positivePattern = /^(\d{1,15}(\.\d{1,3})?)$/;

/** A non-negative decimal. */
export const nonNegativeDecimalSchema = decimalSchema.refine(
  (value) => nonNegativePattern.test(value),
  { message: 'expected a non-negative decimal' },
);

/** A strictly positive decimal. Quantities and document lines are never zero. */
export const positiveDecimalSchema = decimalSchema.refine(
  (value) => /[1-9]/.test(value) && positivePattern.test(value),
  { message: 'expected a strictly positive decimal' },
);

/**
 * Whether a validated decimal exceeds `MAX_RATE`, compared digit-wise so that no
 * float is involved in a bound that guards financial input.
 */
function exceedsMaxRate(value: string): boolean {
  const [integerPart = '0', fractionPart = ''] = value.replace('-', '').split('.');
  const left = integerPart.padStart(3, '0');
  if (left.length > 3) return true;
  if (left > '100') return true;
  return left === '100' && /[1-9]/.test(fractionPart);
}

/** Money: an amount of money, carried exactly. Branded so a `Quantity` will not typecheck here. */
export type Money = string & { readonly __brand: 'Money' };

/** Quantity: how much of an Item, in its unit of measure. */
export type Quantity = string & { readonly __brand: 'Quantity' };

/** Rate: a percentage, e.g. a tax rate. */
export type Rate = string & { readonly __brand: 'Rate' };

export const moneySchema = z
  .custom<Money>((value) => typeof value === 'string' && decimalSchema.safeParse(value).success, {
    message: 'invalid money amount',
  })
  .describe('An exact monetary amount as a decimal string, at most 18 digits with 3 decimals.');

export const quantitySchema = z
  .custom<Quantity>(
    (value) => typeof value === 'string' && positiveDecimalSchema.safeParse(value).success,
    { message: 'expected a strictly positive quantity' },
  )
  .describe('A strictly positive exact decimal string, at most 18 digits with 3 decimals.');

export const rateSchema = z
  .custom<Rate>(
    (value) =>
      typeof value === 'string' && decimalSchema.safeParse(value).success && !exceedsMaxRate(value),
    { message: `expected a rate between 0 and ${MAX_RATE}` },
  )
  .describe('A percentage rate as an exact decimal string.');

/** The zero amount. Every total starts here, so it exists as a named value. */
export const ZERO: Money = '0' as Money;

/** Parse an untrusted value (request body, environment, database string) into `Money`. */
export function money(value: string): Money {
  return moneySchema.parse(value);
}

/** Parse an untrusted value into `Quantity`. */
export function quantity(value: string): Quantity {
  return quantitySchema.parse(value);
}

/** Parse an untrusted value into `Rate`. */
export function rate(value: string): Rate {
  return rateSchema.parse(value);
}

/**
 * Render an amount for a human, keeping all `SCALE` decimals so a receipt never
 * shows fewer digits than the ledger holds. `Intl` formats a decimal *string*
 * exactly, so no float is created here either. Display-only: never parse this back.
 */
export function formatAmount(value: string, locale: string, currency?: string): string {
  // The cast is a type-level necessity only: `format` is declared to take a
  // numeric literal type, and at runtime it parses the string as a decimal.
  const literal = value as `${number}`;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: SCALE,
    maximumFractionDigits: SCALE,
    ...(currency ? { style: 'currency', currency } : {}),
  }).format(literal);
}
