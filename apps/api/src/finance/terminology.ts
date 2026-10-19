/**
 * Document terminology (CONTEXT.md: "Terminology is stored per entity, code and
 * locale").
 *
 * The template asks for a code and never for a literal, so wording is data. A
 * label changes on a row, from the settings screen, with no template edit and no
 * deploy — which is also why a test can assert the layout without pinning the
 * words: it asserts that every code resolves, never what one resolves to.
 *
 * ## The shipped table is a starting point
 *
 * The three locales below are the shipped starting point, and a Business may
 * override any label from the settings screen. Two consequences, both enforced
 * here rather than left to habit:
 *
 * 1. `vat.exemptMention` — the wording that tells a tax authority why no VAT is
 *    charged — is **not** a legal sentence in this file. It is a visibly
 *    unapproved marker. A Business supplies its own approved wording through the
 *    `Label` rows this resolver reads; shipping a plausible-looking Tunisian
 *    phrase nobody reviewed would be worse than shipping nothing.
 * 2. The defaults ship so that a first invoice is not blank. A Business that
 *    files with a tax authority replaces them with its own approved wording.
 */

/**
 * The three locales are declared once, in `packages/contracts`, and re-exported
 * here for the modules that render documents. The web app renders the same
 * documents and must not hold its own list: two lists drift, and the drift shows
 * up as an Arabic invoice printed in English.
 */
export { LOCALES, type Locale } from '@easyerp/contracts';

import type { Locale } from '@easyerp/contracts';

/** Locales laid out right-to-left. Arabic is the only one today. */
const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>(['ar']);

/**
 * The writing direction for a locale. Drives `dir` on the document element, and
 * therefore every box inside it — the template uses logical properties only, so
 * one attribute flips the whole document with no mirrored stylesheet.
 */
/**
 * The word a paper prints when it is not an issued document.
 *
 * Not legal text: it is the status of the row, and printing it is what makes a
 * draft or a cancelled document honest — a paper that looks exactly like an issued
 * invoice while carrying no number is worse than one that says BROUILLON on it.
 * `ISSUED` has no word, because an issued document's masthead already says
 * everything a reader needs.
 */
export type DocumentStatus = 'DRAFT' | 'ISSUED' | 'CANCELLED';

const STATUS_WORDS: Readonly<Record<Exclude<DocumentStatus, 'ISSUED'>, Record<Locale, string>>> = {
  DRAFT: { fr: 'BROUILLON', en: 'DRAFT', ar: 'مسودة' },
  CANCELLED: { fr: 'ANNULÉ', en: 'CANCELLED', ar: 'ملغاة' },
};

export function statusWord(status: DocumentStatus, locale: Locale): string | null {
  if (status === 'ISSUED') return null;
  return STATUS_WORDS[status][locale];
}

export function directionOf(locale: Locale): 'ltr' | 'rtl' {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}

/** Every label code a Customer Invoice renders. */
export const INVOICE_LABELS = [
  'document.customerInvoice',
  'document.creditNote',
  'field.number',
  'field.issuedAt',
  'field.issuer',
  'field.party',
  'field.taxIdentifier',
  'field.address',
  'field.corrects',
  'field.description',
  'field.quantity',
  'field.unitPrice',
  'field.net',
  'field.gross',
  'field.subtotal',
  'field.taxRate',
  'field.taxBase',
  'field.taxAmount',
  'field.totalTax',
  'field.totalGross',
  'field.vatBreakdown',
  'field.stampDuty',
  'field.withholdingTax',
  'vat.exemptHeading',
  'vat.exemptMention',
] as const;

export type InvoiceLabelCode = (typeof INVOICE_LABELS)[number];

type LabelTable = Record<InvoiceLabelCode, string>;

/**
 * The unreviewed starting point. Replace with `Label` rows per Business; these
 * exist so the three locales are exercised end to end from the first slice.
 *
 * Amounts are always written with Latin digits, including in `ar`. Tunisian
 * financial documents conventionally use them, and mixing Arabic-Indic digits
 * into a `numeric(18,3)` column's rendered form is the kind of cosmetic decision
 * that silently breaks a client's downstream import. Revisit with an accountant,
 * not from memory.
 */
const UNREVIEWED_LABELS: Record<Locale, LabelTable> = {
  fr: {
    'document.customerInvoice': 'FACTURE',
    'document.creditNote': 'AVOIR',
    'field.number': 'Numéro',
    'field.issuedAt': 'Date',
    'field.issuer': 'Émetteur',
    'field.party': 'Client',
    'field.taxIdentifier': 'Matricule fiscal',
    'field.address': 'Adresse',
    'field.corrects': 'Corrige',
    'field.description': 'Désignation',
    'field.quantity': 'Quantité',
    'field.unitPrice': 'Prix unitaire',
    'field.net': 'Montant HT',
    'field.gross': 'Montant TTC',
    'field.subtotal': 'Total HT',
    'field.taxRate': 'Taux',
    'field.taxBase': 'Base',
    'field.taxAmount': 'Montant TVA',
    'field.totalTax': 'Total TVA',
    'field.totalGross': 'Total TTC',
    'field.vatBreakdown': 'Détail TVA',
    'field.stampDuty': 'Droit de timbre',
    'field.withholdingTax': 'Retenue à la source',
    'vat.exemptHeading': 'TVA non applicable',
    'vat.exemptMention': '[MENTION TVA NON APPLICABLE — À FAIRE VALIDER]',
  },
  en: {
    'document.customerInvoice': 'INVOICE',
    'document.creditNote': 'CREDIT NOTE',
    'field.number': 'Number',
    'field.issuedAt': 'Date',
    'field.issuer': 'Issuer',
    'field.party': 'Customer',
    'field.taxIdentifier': 'Tax ID',
    'field.address': 'Address',
    'field.corrects': 'Corrects',
    'field.description': 'Description',
    'field.quantity': 'Quantity',
    'field.unitPrice': 'Unit price',
    'field.net': 'Net',
    'field.gross': 'Gross',
    'field.subtotal': 'Subtotal',
    'field.taxRate': 'Rate',
    'field.taxBase': 'Base',
    'field.taxAmount': 'VAT',
    'field.totalTax': 'Total VAT',
    'field.totalGross': 'Total',
    'field.vatBreakdown': 'VAT breakdown',
    'field.stampDuty': 'Stamp duty',
    'field.withholdingTax': 'Withholding tax',
    'vat.exemptHeading': 'VAT not applicable',
    'vat.exemptMention': '[VAT NOT APPLICABLE — PENDING REVIEW]',
  },
  ar: {
    'document.customerInvoice': 'فاتورة',
    'document.creditNote': 'إشعار خصم',
    'field.number': 'الرقم',
    'field.issuedAt': 'التاريخ',
    'field.issuer': 'الصدر',
    'field.party': 'العميل',
    'field.taxIdentifier': 'المعرّف الجبائي',
    'field.address': 'العنوان',
    'field.corrects': 'يصحّح',
    'field.description': 'البيان',
    'field.quantity': 'الكمية',
    'field.unitPrice': 'سعر الوحدة',
    'field.net': 'المبلغ الصافي',
    'field.gross': 'المبلغ الإجمالي',
    'field.subtotal': 'المجموع الصافي',
    'field.taxRate': 'النسبة',
    'field.taxBase': 'الأساس',
    'field.taxAmount': 'مبلغ الضريبة',
    'field.totalTax': 'مجموع الضريبة',
    'field.totalGross': 'المجموع الإجمالي',
    'field.vatBreakdown': 'تفصيل الضريبة',
    'field.stampDuty': 'رسم الطابع',
    'field.withholdingTax': 'الاقتطاع من المصدر',
    'vat.exemptHeading': 'الضريبة على القيمة المضافة غير قابلة للتطبيق',
    'vat.exemptMention': '[إشعار عدم خضوع الضريبة على القيمة المضافة — بانتظار المراجعة]',
  },
};

/** Resolves a code to wording. The only way the template ever learns a word. */
export type LabelResolver = (code: InvoiceLabelCode) => string;

export class UnknownLabelError extends Error {
  constructor(code: string, locale: Locale) {
    super(
      `No ${locale} label for code "${code}". A document renders from data, so a missing label is an error rather than a blank cell.`,
    );
    this.name = 'UnknownLabelError';
  }
}

/**
 * Build a resolver for a locale, overlaying reviewed `Label` rows on the
 * unreviewed defaults.
 *
 * A missing override is not an error; a missing *code* is. Overlaying is what
 * lets one Business print "Designation" while another prints "Item", with no
 * code change and no test edited to match.
 */
export function terminologyFor(
  locale: Locale,
  overrides: Partial<Record<InvoiceLabelCode, string>> = {},
): LabelResolver {
  const base = UNREVIEWED_LABELS[locale];

  return (code) => {
    const override = overrides[code];
    if (override !== undefined && override !== '') {
      return override;
    }

    const value = base[code];
    if (value === undefined) {
      throw new UnknownLabelError(code, locale);
    }

    return value;
  };
}
