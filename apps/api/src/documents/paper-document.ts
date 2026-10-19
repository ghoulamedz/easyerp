/**
 * The render model of the five operational papers (ADR 0010): Sales Order,
 * Delivery Note, Purchase Order, Goods Receipt and Production Order.
 *
 * Where the Customer Invoice view (`finance/invoice-document.ts`) is a fiscal
 * artifact with a VAT regime, these papers are operational documents: the
 * quantities and (where the paper carries money) the stored figures, plus the
 * references that tie the paper to its source order. Everything is mapped from
 * already-stored rows — the template recomputes nothing, so what the paper
 * prints and what the API returned cannot drift apart.
 *
 * Two shapes:
 *
 * - **Priced** (Sales Order, Purchase Order): lines carry the stored money and
 *   the totals block prints the stored figures.
 * - **Quantities** (Delivery Note, Goods Receipt, Production Order): the paper
 *   quotes quantities only — price data belongs to the fiscal documents the
 *   stock movement fulfils, and an operational note printing prices it never
 *   charged is a wrong paper.
 */

import { localeSchema, type Locale } from '@easyerp/contracts';

import { directionOf, type DocumentStatus } from '../finance/terminology.js';

export const PAPER_TYPES = [
  'SALES_ORDER',
  'DELIVERY_NOTE',
  'PURCHASE_ORDER',
  'GOODS_RECEIPT',
  'PRODUCTION_ORDER',
] as const;

export type PaperKind = (typeof PAPER_TYPES)[number];

/** The name a typed error message uses for one paper kind. */
export function paperEntityName(kind: PaperKind): string {
  switch (kind) {
    case 'SALES_ORDER':
      return 'Sales Order';
    case 'DELIVERY_NOTE':
      return 'Delivery Note';
    case 'PURCHASE_ORDER':
      return 'Purchase Order';
    case 'GOODS_RECEIPT':
      return 'Goods Receipt';
    case 'PRODUCTION_ORDER':
      return 'Production Order';
  }
}

export interface PaperParty {
  readonly displayName: string;
  readonly taxIdentifier: string;
  readonly addressLines: readonly string[];
}

export interface PaperIssuerInput {
  readonly legalName: string;
  readonly taxIdentifier: string | null;
  readonly addressLine1: string | null;
  readonly city: string | null;
  readonly countryCode: string | null;
}

export interface PaperPartyInput {
  readonly name: string;
  readonly taxIdentifier?: string | null;
  readonly address: string | null;
  readonly city: string | null;
  readonly countryCode: string | null;
}

export interface PaperLineInput {
  readonly description: string;
  readonly quantity: string;
  readonly unitCode: string | null;
}

export interface PricedPaperLineInput {
  readonly description: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly taxRate: string;
  readonly netAmount: string;
  readonly taxAmount: string;
  readonly grossAmount: string;
}

export interface PaperTaxGroupInput {
  readonly rate: string;
  readonly base: string;
  readonly amount: string;
}

export interface PaperTotalsInput {
  readonly netAmount: string;
  readonly taxAmount: string;
  readonly grossAmount: string;
}

export interface PaperView {
  readonly kind: PaperKind;
  readonly locale: Locale;
  readonly direction: 'ltr' | 'rtl';
  /**
   * The row's status. A draft and a cancelled document print too — with the word
   * from `statusWord` across the page — because "show me what this will look like"
   * is the question a person asks *before* issuing, and a paper that cannot be
   * viewed until it is issued answers it too late.
   */
  readonly status: DocumentStatus;
  readonly number: string;
  readonly issuedAt: string;
  /** Carried only when the paper prints money; quantities-only papers omit it. */
  readonly currency: string | null;
  readonly issuer: PaperParty;
  readonly party: PaperParty | null;
  /** Source-of-truth references printed under the masthead (order it fulfils…). */
  readonly references: readonly PaperReference[];
  /** True when lines carry the stored money and the totals block prints. */
  readonly priced: boolean;
  readonly pricedLines: readonly PricedPaperLineInput[];
  readonly quantityLines: readonly PaperLineInput[];
  readonly taxGroups: readonly PaperTaxGroupInput[];
  readonly totals: PaperTotalsInput | null;
}

/** A one-line reference to the document (or article) the paper comes from. */
export interface PaperReference {
  readonly code: PaperReferenceCode;
  readonly value: string;
}

export type PaperReferenceCode = 'salesOrder' | 'purchaseOrder' | 'finishedItem';

/** Map a Party row (or the API's party shape) to the paper's party block. */
export function paperPartyOf(party: PaperPartyInput | null | undefined): PaperParty | null {
  if (!party) return null;

  return {
    displayName: party.name,
    taxIdentifier: party.taxIdentifier ?? '',
    addressLines: [party.address, party.city, party.countryCode].filter(
      (part): part is string => Boolean(part),
    ),
  };
}

/** Map a Business row to the paper's issuer block. */
export function paperIssuerOf(business: PaperIssuerInput): PaperParty {
  return {
    displayName: business.legalName,
    taxIdentifier: business.taxIdentifier ?? '',
    addressLines: [
      business.addressLine1,
      business.city,
      business.countryCode,
    ].filter((part): part is string => Boolean(part)),
  };
}

/**
 * The paper's locale. Stored document locales are one of the three contract
 * locales; an unrecognised value renders French, mirroring how the document
 * services choose a locale from the Business country today.
 */
export function paperLocale(documentLocale: string): Locale {
  const parsed = localeSchema.safeParse(documentLocale);
  return parsed.success ? parsed.data : 'fr';
}

/** Assemble a quantities-only paper. */
export function quantityPaperView(input: {
  kind: PaperKind;
  locale: Locale;
  status: DocumentStatus;
  number: string;
  issuedAt: string;
  issuer: PaperParty;
  party: PaperParty | null;
  references: readonly PaperReference[];
  lines: readonly PaperLineInput[];
}): PaperView {
  return {
    kind: input.kind,
    locale: input.locale,
    direction: directionOf(input.locale),
    status: input.status,
    number: input.number,
    issuedAt: input.issuedAt,
    currency: null,
    issuer: input.issuer,
    party: input.party,
    references: input.references,
    priced: false,
    pricedLines: [],
    quantityLines: input.lines,
    taxGroups: [],
    totals: null,
  };
}

/** Assemble a priced paper. The totals are the stored figures, passed through. */
export function pricedPaperView(input: {
  kind: PaperKind;
  locale: Locale;
  status: DocumentStatus;
  number: string;
  issuedAt: string;
  /** Optional: the operational papers carry the served figures, which print
   * without a currency label, exactly as the fiscal template prints them. */
  currency?: string | null;
  issuer: PaperParty;
  party: PaperParty | null;
  references: readonly PaperReference[];
  lines: readonly PricedPaperLineInput[];
  taxGroups: readonly PaperTaxGroupInput[];
  totals: PaperTotalsInput;
}): PaperView {
  return {
    kind: input.kind,
    locale: input.locale,
    direction: directionOf(input.locale),
    status: input.status,
    number: input.number,
    issuedAt: input.issuedAt,
    currency: input.currency ?? null,
    issuer: input.issuer,
    party: input.party,
    references: input.references,
    priced: true,
    pricedLines: input.lines,
    quantityLines: [],
    taxGroups: input.taxGroups,
    totals: input.totals,
  };
}
