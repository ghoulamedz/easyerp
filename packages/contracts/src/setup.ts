/**
 * First-run Setup (ADR 0012).
 *
 * A fresh deployment has no Business and no User, so Setup is the one
 * unauthenticated write in the product: reachable only while no Business exists,
 * gated on a token the host supplies, and creating the Business, the first
 * Administrator, number patterns, Units and Tax Rates in one transaction.
 *
 * Everything this file describes is part of that one-time moment. The code that
 * runs every day afterwards lives in `settings.ts`; the two never overlap.
 */

import { z } from 'zod';
import { rateSchema } from './numeric.js';
import { vatRegimeSchema } from './documents.js';

export type { VatRegime } from './documents.js';

/** The answer to "is this deployment ready to be configured?". */
export const setupStatusSchema = z.object({
  needsSetup: z.boolean(),
});
export type SetupStatus = z.infer<typeof setupStatusSchema>;

const setupBusinessSchema = z.object({
  /** The legal name quoted on documents (ADR 0011). */
  legalName: z.string().min(1).max(255),
  /** The brand shown in the interface; distinct from the legal identity. */
  displayName: z.string().min(1).max(255),
  /** The legal tax identifier, quoted on every fiscal document. */
  taxIdentifier: z.string().min(1).max(32),
  /** ISO 3166-1 alpha-2. `Char(2)` in the schema, so exactly two letters. */
  countryCode: z.string().regex(/^[A-Z]{2}$/, 'expected an ISO 3166-1 alpha-2 country code'),
  vatRegime: vatRegimeSchema,
  /** ISO 4217. `Char(3)` in the schema, so exactly three letters. */
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, 'expected an ISO 4217 currency code')
    .default('TND'),
  phone: z.string().max(32).optional(),
  email: z.string().email().max(320).optional(),
  addressLine1: z.string().max(255).optional(),
  addressLine2: z.string().max(255).optional(),
  city: z.string().max(120).optional(),
  postalCode: z.string().max(32).optional(),
});

const setupAdministratorSchema = z.object({
  email: z.string().email().max(320),
  name: z.string().min(1).max(255),
  /** The password the person completing Setup chooses. Never stored in the clear. */
  password: z.string().min(8).max(128),
});

const setupUnitSchema = z.object({
  /** Stable code, e.g. `PCS`, `KG`. Never translated (CONTEXT.md). */
  code: z.string().min(1).max(16),
  allowsFraction: z.boolean().default(true),
});

const setupTaxRateSchema = z.object({
  /** Stable code, e.g. `STANDARD_19`. */
  code: z.string().min(1).max(32),
  /** Zero is legitimate (exempt goods), and never a literal in code. */
  rate: rateSchema,
});

/** What Setup must receive. `.strict()`: an unknown field is a client bug. */
export const setupRequestSchema = z
  .object({
    /** Single-use token from the host's environment (ADR 0012). */
    token: z.string().min(1),
    business: setupBusinessSchema,
    administrator: setupAdministratorSchema,
    /** At least one, or a Business with nothing to measure in (ADR 0012). */
    units: z.array(setupUnitSchema).min(1),
    /**
     * At least one when the regime is STANDARD, so a Business with a breakdown
     * to print is not created without a single rate to print from. The rule is
     * enforced by the service, where a DomainError speaks HTTP.
     */
    taxRates: z.array(setupTaxRateSchema).default([]),
  })
  .strict();
export type SetupRequest = z.infer<typeof setupRequestSchema>;

export const setupResultSchema = z.object({
  businessId: z.string().min(1),
  administratorEmail: z.string().email(),
});
export type SetupResult = z.infer<typeof setupResultSchema>;
