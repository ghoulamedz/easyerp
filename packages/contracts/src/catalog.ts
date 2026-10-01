/**
 * Catalog and counterparties. `Item type` and `Unit of measure` carry stable
 * codes; their displayed labels come from the Business's own terminology
 * (ADR 0008), so a French, English or Arabic instance reads natively.
 */

import { z } from 'zod';
import { moneySchema, quantitySchema, rateSchema } from './numeric.js';

export const ITEM_TYPES = [
  'RAW_MATERIAL',
  'SEMI_FINISHED',
  'FINISHED_GOOD',
  'SERVICE',
  'CONSUMABLE',
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];
export const itemTypeSchema = z.enum(ITEM_TYPES);

export const unitSchema = z.object({
  id: z.string().min(1),
  /** Stable code, e.g. `PCS`, `KG`, `H`. */
  code: z.string().min(1).max(16),
  /** Whether quantities in this unit may carry a fractional part. */
  allowsFraction: z.boolean(),
});
export type Unit = z.infer<typeof unitSchema>;

export const taxRateSchema = z.object({
  id: z.string().min(1),
  /** Stable code, e.g. `STANDARD_19`, `EXEMPT`. */
  code: z.string().min(1).max(32),
  label: z.string().min(1).max(120),
  rate: rateSchema,
  /** Whether an invoice in this regime prints a per-rate breakdown. */
  isStandard: z.boolean(),
  activeFrom: z.string().datetime(),
  activeTo: z.string().datetime().nullable(),
});
export type TaxRate = z.infer<typeof taxRateSchema>;

/**
 * An Item: something the Business stocks, buys, sells or produces. It carries no
 * stock balance — On-hand is derived from the ledger (ADR 0004) — and no
 * per-client fields: those live in the Custom Field payload (ADR 0008).
 */
export const itemSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  description: z.string().max(2000).nullable(),
  itemType: itemTypeSchema,
  baseUnitId: z.string().min(1),
  purchaseUnitId: z.string().min(1).nullable(),
  saleUnitId: z.string().min(1).nullable(),
  taxRateId: z.string().min(1),
  /** Resolved by the server; a client never sends a price (ADR 0005). */
  salePrice: moneySchema,
  purchasePrice: moneySchema,
  /** Drives the reorder alert; it is a threshold, not a reservation. */
  reorderPoint: quantitySchema.nullable(),
  isService: z.boolean(),
  isActive: z.boolean(),
  /** Values of the Custom Fields defined for items. */
  customFields: z.record(z.string(), z.unknown()).default({}),
});
export type Item = z.infer<typeof itemSchema>;

/** What a client may send when creating or updating an Item. */
export const itemInputSchema = itemSchema
  .omit({ id: true, isService: true })
  .extend({ customFields: z.record(z.string(), z.unknown()).optional() });
export type ItemInput = z.infer<typeof itemInputSchema>;

export const PARTY_ROLES = ['CUSTOMER', 'SUPPLIER'] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];

/**
 * A Party holds one or both commercial roles. A Party that is both is normal
 * and must not require two records — the legacy schema made that impossible.
 */
export const partySchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  roles: z.array(z.enum(PARTY_ROLES)).min(1),
  /** The legal tax identifier of the country. Unique per Business. */
  taxIdentifier: z.string().min(1).max(32).nullable(),
  email: z.string().email().nullable(),
  phone: z.string().min(1).max(32).nullable(),
  address: z.string().max(500).nullable(),
  city: z.string().max(120).nullable(),
  countryCode: z.string().length(2).nullable(),
  isActive: z.boolean(),
  customFields: z.record(z.string(), z.unknown()).default({}),
});
export type Party = z.infer<typeof partySchema>;

/**
 * Commercial conditions held for a Customer, referenced by Sales Orders and
 * Customer Invoices. They are never applied on their own.
 */
export const customerTermsSchema = z.object({
  partyId: z.string().min(1),
  /** Days after issue before the invoice falls due. */
  paymentTermDays: z.number().int().min(0).max(365),
  creditLimit: moneySchema.nullable(),
  deliveryAddress: z.string().max(500).nullable(),
});
export type CustomerTerms = z.infer<typeof customerTermsSchema>;
