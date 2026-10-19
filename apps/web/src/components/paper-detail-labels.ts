/**
 * The translated label set the paper `[id]` pages hand to `DocumentPaperDetail`.
 *
 * Kept out of the client component so the server page can build it with
 * `translatorFor` (the component must not know the i18n table; the pages name
 * the vocabulary). The party label differs by paper — a Purchase Order and a
 * Goods Receipt address a Supplier, everything else its Customer.
 */

import { translatorFor, type Locale } from '../i18n/config';
import type { PaperDetailLabels } from './paper-detail';

export function paperDetailLabels(
  locale: Locale,
  party: 'customer' | 'supplier',
): PaperDetailLabels {
  const t = translatorFor(locale);
  return {
    details: t('detailDetails'),
    number: t('detailNumber'),
    status: t('detailStatus'),
    date: t('date'),
    party: party === 'customer' ? t('customer') : t('detailSupplier'),
    lines: t('detailLines'),
    item: t('item'),
    quantity: t('quantity'),
    net: t('invoiceSubtotal'),
    tax: t('invoiceTax'),
    gross: t('invoiceTotal'),
    print: t('printButton'),
    loading: t('detailLoading'),
    archiveHint: t('detailArchiveHint'),
    statusDraft: t('statusDraft'),
    statusIssued: t('statusIssued'),
    statusCancelled: t('statusCancelled'),
  };
}
