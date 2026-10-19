/**
 * The Customer Invoice fixtures the two golden tiers share.
 *
 * One definition, two gates: `invoice.golden.spec.ts` renders these through
 * Chromium and compares PDFs (layout, pagination, Arabic shaping), and
 * `invoice-print-golden.test.ts` renders the same views to HTML and compares
 * bytes with no browser involved. Two copies of the matrix would let the cheap
 * gate and the expensive one disagree about what is being tested, whose failure
 * mode is a document that passes every commit and fails the browser gate alone.
 *
 * The line data reconciles by hand, so a golden that changes is a change in
 * presentation and a failing assertion is a real arithmetic defect.
 *
 *   2 x 125.000 @ 19%  ->  net 250.000  tax 47.500
 *   1 x  40.000 @ 13%  ->  net  40.000  tax  5.200
 *   3.5 x 12.000 @ 7%  ->  net  42.000  tax  2.940
 *                          net 332.000  tax 55.640  gross 387.640
 *
 * Deliberately unreviewed by a native speaker: the wording in `terminology.ts` is
 * what a human reviews, not the tests that print it.
 */

import { buildCustomerInvoice, type CustomerInvoiceView } from '../invoice-document.js';
import { terminologyFor, type Locale } from '../terminology.js';

export { LOCALES } from '../terminology.js';

export const ISSUER = {
  displayName: 'Société Atelier du Sahel',
  taxIdentifier: '1234567/A/M/000',
  addressLines: ['12 rue de la Liberté', '1000 Tunis', 'Tunisie'],
};

export const PARTY = {
  displayName: 'Carthage Distribution',
  taxIdentifier: '9876543/B/M/000',
  addressLines: ['Zone industrielle de Ben Arous', '2033 Ben Arous', 'Tunisie'],
};

/**
 * Line data whose totals reconcile by hand, so a golden that changes is a change
 * in presentation and a failing assertion is a real arithmetic defect.
 *
 *   2 x 125.000 @ 19%  ->  net 250.000  tax 47.500
 *   1 x  40.000 @ 13%  ->  net  40.000  tax  5.200
 *   3.5 x 12.000 @ 7%  ->  net  42.000  tax  2.940
 *                          net 332.000  tax 55.640  gross 387.640
 */
export const MIXED_RATE_LINES = [
  {
    description: 'Prestation de développement',
    quantity: '2',
    unitPrice: '125.000',
    taxRate: '19',
  },
  { description: 'Licence annuelle', quantity: '1', unitPrice: '40.000', taxRate: '13' },
  { description: 'Support technique', quantity: '3.5', unitPrice: '12.000', taxRate: '7' },
];

export const STANDARD_LINES = [
  {
    description: 'Prestation de développement',
    quantity: '2',
    unitPrice: '125.000',
    taxRate: '19',
  },
  { description: 'Fournitures', quantity: '1', unitPrice: '80.000', taxRate: '19' },
];

/** An exempt Business charges no VAT, so the lines carry no rate. */
export const EXEMPT_LINES = [
  { description: 'Prestation exonérée de TVA', quantity: '2', unitPrice: '125.000', taxRate: '0' },
  { description: 'Fournitures', quantity: '1', unitPrice: '80.000', taxRate: '0' },
];

export function invoice(
  locale: Locale,
  vatRegime: 'STANDARD' | 'EXEMPT',
  lines: typeof MIXED_RATE_LINES,
  overrides: Partial<Parameters<typeof buildCustomerInvoice>[0]> = {},
): CustomerInvoiceView {
  return buildCustomerInvoice({
    // Padding 4 is the database default; exercising it here is what proves the
    // stored value reaches the document.
    pattern: 'FA-{year}-{seq}',
    sequence: 42,
    padding: 4,
    year: 2026,
    issuedAt: '2026-10-04',
    locale,
    vatRegime,
    currency: 'TND',
    labels: terminologyFor(locale),
    issuer: ISSUER,
    party: PARTY,
    lines,
    stampDuty: vatRegime === 'STANDARD' ? '1.000' : undefined,
    ...overrides,
  });
}
