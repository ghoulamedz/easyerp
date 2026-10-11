/**
 * Settings: every day the Business is configured from the database and never
 * from a file (ADR 0013, CONTEXT.md). This file is the wire shape of the
 * Administrator's configuration screens ("a new client is onboarded by
 * configuring, not by forking").
 *
 * Setup (`setup.ts`) provisions the initial set; Settings is its permanent
 * successor. The two never overlap: Setup runs once and writes the rows this
 * module reads, and an Administrator edits them afterwards.
 */

import { z } from 'zod';
import {
  documentTypeSchema,
  localeSchema,
  numberPatternSchema,
  vatRegimeSchema,
  type DocumentType,
} from './documents.js';
import { rateSchema } from './numeric.js';
import { backorderPolicySchema } from './stock.js';

const countryCodeSchema = z
  .string()
  .regex(/^[A-Z]{2}$/, 'expected an ISO 3166-1 alpha-2 country code');
const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/, 'expected an ISO 4217 currency code');

// ---------------------------------------------------------------------------
// Business profile
// ---------------------------------------------------------------------------

/** The read shape of the Business profile. Optional particulars are absent, never null. */
export const businessProfileSchema = z.object({
  legalName: z.string().min(1).max(255),
  displayName: z.string().min(1).max(255),
  taxIdentifier: z.string().min(1).max(32),
  taxIdentifierLabel: z.string().max(120).nullish(),
  activityCode: z.string().max(32).nullish(),
  addressLine1: z.string().max(255).nullish(),
  addressLine2: z.string().max(255).nullish(),
  city: z.string().max(120).nullish(),
  postalCode: z.string().max(32).nullish(),
  countryCode: countryCodeSchema,
  phone: z.string().max(32).nullish(),
  email: z.string().email().max(320).nullish(),
  iban: z.string().max(64).nullish(),
  bankName: z.string().max(255).nullish(),
  logoUrl: z.string().max(1000).nullish(),
  vatRegime: vatRegimeSchema,
  currency: currencyCodeSchema,
  /**
   * How Sales Order issuance treats Available (stories 39–40). `STRICT` refuses
   * an order that would oversell; `ALLOW` lets a known shortage through as a
   * backorder. A Business Setting, read on issue — not a constant in either
   * service.
   */
  backorderPolicy: backorderPolicySchema,
});
export type BusinessProfile = z.infer<typeof businessProfileSchema>;

/**
 * What a client may change in one call. `.strict()` and partial, so a typo is a
 * named error and a single endpoint edits one field or ten without reshaping the
 * wire. Every field is optional; an empty object is refused because a no-op
 * update is a client bug, and the refusal names the rule.
 */
export const businessProfileUpdateSchema = z
  .object({
    legalName: z.string().min(1).max(255).optional(),
    displayName: z.string().min(1).max(255).optional(),
    taxIdentifier: z.string().min(1).max(32).optional(),
    taxIdentifierLabel: z.string().max(120).nullish(),
    activityCode: z.string().max(32).nullish(),
    addressLine1: z.string().max(255).nullish(),
    addressLine2: z.string().max(255).nullish(),
    city: z.string().max(120).nullish(),
    postalCode: z.string().max(32).nullish(),
    countryCode: countryCodeSchema.optional(),
    phone: z.string().max(32).nullish(),
    email: z.string().email().max(320).nullish(),
    iban: z.string().max(64).nullish(),
    bankName: z.string().max(255).nullish(),
    logoUrl: z.string().max(1000).nullish(),
    vatRegime: vatRegimeSchema.optional(),
    currency: currencyCodeSchema.optional(),
    backorderPolicy: backorderPolicySchema.optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'an empty patch changes nothing and is a client bug',
  });
export type BusinessProfileUpdate = z.infer<typeof businessProfileUpdateSchema>;

// ---------------------------------------------------------------------------
// Tax Rates
// ---------------------------------------------------------------------------

/** Effective dates carried as calendar dates (YYYY-MM-DD), not timestamps. */
const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected a calendar date YYYY-MM-DD');

export const taxRateRecordSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1).max(32),
  rate: rateSchema,
  activeFrom: calendarDateSchema,
  activeTo: calendarDateSchema.nullish(),
  isActive: z.boolean(),
});
export type TaxRateRecord = z.infer<typeof taxRateRecordSchema>;

export const taxRateInputSchema = z.object({
  code: z.string().min(1).max(32),
  rate: rateSchema,
  /** Effective from this date. A rate change applies from a date, never by rewriting history. */
  activeFrom: calendarDateSchema,
  /** Ceases to apply on this date; null means it still applies. */
  activeTo: calendarDateSchema.nullish(),
});
export type TaxRateInput = z.infer<typeof taxRateInputSchema>;

/** A partial edit of a Tax Rate. Retiring is `{ isActive: false }`. */
export const taxRateUpdateSchema = z
  .object({
    code: z.string().min(1).max(32).optional(),
    rate: rateSchema.optional(),
    activeFrom: calendarDateSchema.optional(),
    activeTo: calendarDateSchema.nullish(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'an empty patch changes nothing and is a client bug',
  });
export type TaxRateUpdate = z.infer<typeof taxRateUpdateSchema>;

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

export const unitRecordSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1).max(16),
  allowsFraction: z.boolean(),
  isActive: z.boolean(),
});
export type UnitRecord = z.infer<typeof unitRecordSchema>;

export const unitInputSchema = z.object({
  code: z.string().min(1).max(16),
  allowsFraction: z.boolean().default(true),
});
export type UnitInput = z.infer<typeof unitInputSchema>;

/** A partial edit of a Unit. Retiring is `{ isActive: false }`. */
export const unitUpdateSchema = z
  .object({
    code: z.string().min(1).max(16).optional(),
    allowsFraction: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'an empty patch changes nothing and is a client bug',
  });
export type UnitUpdate = z.infer<typeof unitUpdateSchema>;

// ---------------------------------------------------------------------------
// Number patterns (ADR 0006)
// ---------------------------------------------------------------------------

export const NUMBER_PADDING_MIN = 1;
export const NUMBER_PADDING_MAX = 12;

export const numberPatternRecordSchema = z.object({
  code: documentTypeSchema,
  pattern: numberPatternSchema,
  /** Digits the sequence is zero-padded to; "CC-2026-0007" is padding 4. */
  padding: z.number().int().min(NUMBER_PADDING_MIN).max(NUMBER_PADDING_MAX),
});
export type NumberPatternRecord = z.infer<typeof numberPatternRecordSchema>;

export const numberPatternUpdateSchema = z
  .object({
    pattern: numberPatternSchema,
    padding: z.number().int().min(NUMBER_PADDING_MIN).max(NUMBER_PADDING_MAX),
  })
  .strict();
export type NumberPatternUpdate = z.infer<typeof numberPatternUpdateSchema>;

// ---------------------------------------------------------------------------
// Terminology (ADR 0009)
// ---------------------------------------------------------------------------

export const LABEL_TYPES = ['DOCUMENT', 'TAX_RATE'] as const;
export type LabelType = (typeof LABEL_TYPES)[number];
export const labelTypeSchema = z.enum(LABEL_TYPES);

export const labelRecordSchema = z.object({
  entityType: labelTypeSchema,
  entityCode: z.string().min(1).max(64),
  locale: localeSchema,
  value: z.string().min(1).max(255),
});
export type LabelRecord = z.infer<typeof labelRecordSchema>;

/**
 * Upsert a terminology override. An empty string deletes the override and lets
 * the reviewed default stand again — storing the empty string would be a
 * different bug, one label that can never be "unchanged".
 */
export const labelUpsertSchema = z
  .object({
    entityType: labelTypeSchema,
    entityCode: z.string().min(1).max(64),
    locale: localeSchema,
    value: z.string().max(255),
  })
  .strict();
export type LabelUpsert = z.infer<typeof labelUpsertSchema>;

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

/**
 * The switchable Modules (CONTEXT.md: "A named capability of easyERP that a
 * Business can switch off"). Each of the seven Document types belongs to one, so
 * a Business that does not manufacture has no Production navigation and no
 * Production endpoints, and the mapping is data the guard reads, not comments.
 */
export const MODULES = ['SALES', 'PURCHASING', 'INVENTORY', 'FINANCE', 'PRODUCTION'] as const;
export type ModuleCode = (typeof MODULES)[number];
export const moduleCodeSchema = z.enum(MODULES);

/** Which Module issues which Document type. Every type is covered exactly once. */
export const MODULE_BY_DOCUMENT_TYPE: Readonly<Record<DocumentType, ModuleCode>> = {
  SALES_ORDER: 'SALES',
  DELIVERY_NOTE: 'SALES',
  CUSTOMER_INVOICE: 'FINANCE',
  CREDIT_NOTE: 'FINANCE',
  PURCHASE_ORDER: 'PURCHASING',
  GOODS_RECEIPT: 'PURCHASING',
  PRODUCTION_ORDER: 'PRODUCTION',
};

export const moduleStateSchema = z.object({
  module: moduleCodeSchema,
  isEnabled: z.boolean(),
});
export type ModuleState = z.infer<typeof moduleStateSchema>;

export const moduleStateUpdateSchema = z
  .object({ isEnabled: z.boolean() })
  .strict()
  .describe('A Module is switched on or off; nothing else is editable about it here.');
export type ModuleStateUpdate = z.infer<typeof moduleStateUpdateSchema>;
