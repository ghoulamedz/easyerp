/**
 * The operational-paper HTML template (ADR 0009, ADR 0010).
 *
 * One template serves the five papers, shape-directed: a priced paper prints
 * the money table and totals block; a quantities paper prints quantity columns
 * only. Like the invoice template it is built from logical properties only
 * (`dir` on the root flips Arabic), every interpolated value is escaped, and
 * amounts render through the same `formatMoney` the fiscal documents use — one
 * printed scale for every paper, three decimals, never recomputed here.
 *
 * The label table is the unreviewed starting point of `finance/terminology.ts`,
 * same discipline: wording is data, native review is its own gate.
 */

import { Decimal } from 'decimal.js';

import { SCALE } from '@easyerp/contracts';

import type { PaperView } from './paper-document.js';
import { escapeHtml, formatMoney } from '../finance/invoice-template.js';

/** A quantity keeps its own scale: `1`, `2.5` and `10` must not all print as `1.000`. */
function formatQuantity(value: string): string {
  return new Decimal(value).toFixed(SCALE).replace(/\.?0+$/, '');
}

/** Every label code the operational papers render. */
export const PAPER_LABEL_CODES = [
  'document.salesOrder',
  'document.deliveryNote',
  'document.purchaseOrder',
  'document.goodsReceipt',
  'document.productionOrder',
  'field.number',
  'field.issuedAt',
  'field.issuer',
  'field.customer',
  'field.supplier',
  'field.internalUse',
  'field.salesOrder',
  'field.purchaseOrder',
  'field.finishedItem',
  'field.description',
  'field.quantity',
  'field.unit',
  'field.unitPrice',
  'field.net',
  'field.taxRate',
  'field.taxAmount',
  'field.gross',
  'field.subtotal',
  'field.totalTax',
  'field.totalGross',
] as const;

export type PaperLabelCode = (typeof PAPER_LABEL_CODES)[number];

type PaperLabelTable = Record<LocaleKey, Record<PaperLabelCode, string>>;

type LocaleKey = 'fr' | 'en' | 'ar';

const UNREVIEWED_PAPER_LABELS: PaperLabelTable = {
  fr: {
    'document.salesOrder': 'COMMANDE CLIENT',
    'document.deliveryNote': 'BON DE LIVRAISON',
    'document.purchaseOrder': "BON D'ACHAT",
    'document.goodsReceipt': 'BON DE RÉCEPTION',
    'document.productionOrder': 'ORDRE DE FABRICATION',
    'field.number': 'Numéro',
    'field.issuedAt': 'Date',
    'field.issuer': 'Émetteur',
    'field.customer': 'Client',
    'field.supplier': 'Fournisseur',
    'field.internalUse': 'Usage interne',
    'field.salesOrder': 'Commande',
    'field.purchaseOrder': "Bon d'achat",
    'field.finishedItem': 'Article produit',
    'field.description': 'Désignation',
    'field.quantity': 'Quantité',
    'field.unit': 'Unité',
    'field.unitPrice': 'Prix unitaire',
    'field.net': 'Montant HT',
    'field.taxRate': 'Taux',
    'field.taxAmount': 'Montant TVA',
    'field.gross': 'Montant TTC',
    'field.subtotal': 'Total HT',
    'field.totalTax': 'Total TVA',
    'field.totalGross': 'Total TTC',
  },
  en: {
    'document.salesOrder': 'SALES ORDER',
    'document.deliveryNote': 'DELIVERY NOTE',
    'document.purchaseOrder': 'PURCHASE ORDER',
    'document.goodsReceipt': 'GOODS RECEIPT',
    'document.productionOrder': 'PRODUCTION ORDER',
    'field.number': 'Number',
    'field.issuedAt': 'Date',
    'field.issuer': 'Issuer',
    'field.customer': 'Customer',
    'field.supplier': 'Supplier',
    'field.internalUse': 'Internal use',
    'field.salesOrder': 'Sales order',
    'field.purchaseOrder': 'Purchase order',
    'field.finishedItem': 'Produced item',
    'field.description': 'Description',
    'field.quantity': 'Quantity',
    'field.unit': 'Unit',
    'field.unitPrice': 'Unit price',
    'field.net': 'Net',
    'field.taxRate': 'Rate',
    'field.taxAmount': 'VAT',
    'field.gross': 'Gross',
    'field.subtotal': 'Subtotal',
    'field.totalTax': 'Total VAT',
    'field.totalGross': 'Total',
  },
  ar: {
    'document.salesOrder': 'طلب بيع',
    'document.deliveryNote': 'سند تسليم',
    'document.purchaseOrder': 'أمر شراء',
    'document.goodsReceipt': 'وصل استلام',
    'document.productionOrder': 'أمر إنتاج',
    'field.number': 'الرقم',
    'field.issuedAt': 'التاريخ',
    'field.issuer': 'الصادر',
    'field.customer': 'العميل',
    'field.supplier': 'المورّد',
    'field.internalUse': 'استخدام داخلي',
    'field.salesOrder': 'طلب البيع',
    'field.purchaseOrder': 'أمر الشراء',
    'field.finishedItem': 'المنتج النهائي',
    'field.description': 'البيان',
    'field.quantity': 'الكمية',
    'field.unit': 'الوحدة',
    'field.unitPrice': 'سعر الوحدة',
    'field.net': 'المبلغ الصافي',
    'field.taxRate': 'النسبة',
    'field.taxAmount': 'مبلغ الضريبة',
    'field.gross': 'المبلغ الإجمالي',
    'field.subtotal': 'المجموع الصافي',
    'field.totalTax': 'مجموع الضريبة',
    'field.totalGross': 'المجموع الإجمالي',
  },
};

/** Resolves a code to wording. The only way the template ever learns a word. */
export type PaperLabelResolver = (code: PaperLabelCode) => string;

export function paperTerminologyFor(locale: LocaleKey): PaperLabelResolver {
  const table = UNREVIEWED_PAPER_LABELS[locale];
  return (code) => {
    const value = table[code];
    if (value === undefined) {
      throw new Error(`No ${locale} paper label for code "${code}".`);
    }
    return value;
  };
}

function paperPartyHeading(paper: PaperView, labels: PaperLabelResolver): string {
  if (paper.kind === 'PURCHASE_ORDER' || paper.kind === 'GOODS_RECEIPT') {
    return labels('field.supplier');
  }
  if (paper.kind === 'PRODUCTION_ORDER') {
    return labels('field.internalUse');
  }
  return labels('field.customer');
}

/** The heading label of a reference row, by its code. */
function referenceLabel(code: 'salesOrder' | 'purchaseOrder' | 'finishedItem', labels: PaperLabelResolver): string {
  switch (code) {
    case 'salesOrder':
      return labels('field.salesOrder');
    case 'purchaseOrder':
      return labels('field.purchaseOrder');
    case 'finishedItem':
      return labels('field.finishedItem');
  }
}

function renderParty(party: PaperView['party'], heading: string): string {
  if (!party) return '';
  const address = party.addressLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('');

  return `
      <section class="party">
        <h2 class="party-heading">${escapeHtml(heading)}</h2>
        <div class="party-name">${escapeHtml(party.displayName)}</div>
        ${
          party.taxIdentifier !== ''
            ? `<div class="party-address">${escapeHtml(party.taxIdentifier)}</div>`
            : ''
        }
        <div class="party-address">${address}</div>
      </section>`;
}

function renderQuantityTable(paper: PaperView, labels: PaperLabelResolver): string {
  const rows = paper.quantityLines
    .map(
      (line) => `
          <tr>
            <td>${escapeHtml(line.description)}</td>
            <td class="numeric">${escapeHtml(formatQuantity(line.quantity))}</td>
            ${line.unitCode === null ? '' : `<td class="numeric">${escapeHtml(line.unitCode)}</td>`}
          </tr>`,
    )
    .join('');

  const unitNames = paper.quantityLines.some((line) => line.unitCode !== null);
  const unitHeading = unitNames ? `
        <th class="numeric">${escapeHtml(labels('field.unit'))}</th>` : '';

  return `
      <table class="lines">
        <thead>
          <tr>
            <th>${escapeHtml(labels('field.description'))}</th>
            <th class="numeric">${escapeHtml(labels('field.quantity'))}</th>${unitHeading}
          </tr>
        </thead>
        <tbody>${rows}
        </tbody>
      </table>`;
}

function renderPricedTable(paper: PaperView, labels: PaperLabelResolver): string {
  const rows = paper.pricedLines
    .map(
      (line) => `
          <tr>
            <td>${escapeHtml(line.description)}</td>
            <td class="numeric">${escapeHtml(formatQuantity(line.quantity))}</td>
            <td class="numeric">${escapeHtml(formatMoney(line.unitPrice))}</td>
            <td class="numeric">${escapeHtml(formatMoney(line.netAmount))}</td>
            <td class="numeric">${escapeHtml(line.taxRate)}%</td>
            <td class="numeric">${escapeHtml(formatMoney(line.taxAmount))}</td>
            <td class="numeric">${escapeHtml(formatMoney(line.grossAmount))}</td>
          </tr>`,
    )
    .join('');

  return `
      <table class="lines">
        <thead>
          <tr>
            <th>${escapeHtml(labels('field.description'))}</th>
            <th class="numeric">${escapeHtml(labels('field.quantity'))}</th>
            <th class="numeric">${escapeHtml(labels('field.unitPrice'))}</th>
            <th class="numeric">${escapeHtml(labels('field.net'))}</th>
            <th class="numeric">${escapeHtml(labels('field.taxRate'))}</th>
            <th class="numeric">${escapeHtml(labels('field.taxAmount'))}</th>
            <th class="numeric">${escapeHtml(labels('field.gross'))}</th>
          </tr>
        </thead>
        <tbody>${rows}
        </tbody>
      </table>`;
}

function renderTotals(paper: PaperView, labels: PaperLabelResolver): string {
  const totals = paper.totals;
  if (!totals) return '';

  return `
      <table class="totals">
        <tbody>
          <tr>
            <th scope="row">${escapeHtml(labels('field.subtotal'))}</th>
            <td class="numeric">${escapeHtml(formatMoney(totals.netAmount))}</td>
          </tr>
          ${
            paper.taxGroups.length > 0
              ? `
          <tr>
            <th scope="row">${escapeHtml(labels('field.totalTax'))}</th>
            <td class="numeric">${escapeHtml(formatMoney(totals.taxAmount))}</td>
          </tr>`
              : ''
          }
          <tr class="totals-grand">
            <th scope="row">${escapeHtml(labels('field.totalGross'))}</th>
            <td class="numeric">${escapeHtml(formatMoney(totals.grossAmount))}</td>
          </tr>
        </tbody>
      </table>`;
}

function renderReferences(paper: PaperView, labels: PaperLabelResolver): string {
  return paper.references
    .map(
      (reference) => `
        <div>
          <dt>${escapeHtml(referenceLabel(reference.code, labels))}</dt>
          <dd class="document-number">${escapeHtml(reference.value)}</dd>
        </div>`,
    )
    .join('');
}

export function renderPaperHtml(paper: PaperView): string {
  const labels = paperTerminologyFor(paper.locale);

  const title = labels(
    paper.kind === 'SALES_ORDER'
      ? 'document.salesOrder'
      : paper.kind === 'DELIVERY_NOTE'
        ? 'document.deliveryNote'
        : paper.kind === 'PURCHASE_ORDER'
          ? 'document.purchaseOrder'
          : paper.kind === 'GOODS_RECEIPT'
            ? 'document.goodsReceipt'
            : 'document.productionOrder',
  );

  return `<!doctype html>
<html lang="${escapeHtml(paper.locale)}" dir="${escapeHtml(paper.direction)}">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>${PAPER_CSS}</style>
  </head>
  <body>
    <header class="masthead">
      <h1 class="document-title">${escapeHtml(title)}</h1>
      <dl class="document-meta">
        <div>
          <dt>${escapeHtml(labels('field.number'))}</dt>
          <dd class="document-number">${escapeHtml(paper.number)}</dd>
        </div>
        <div>
          <dt>${escapeHtml(labels('field.issuedAt'))}</dt>
          <dd>${escapeHtml(paper.issuedAt)}</dd>
        </div>${renderReferences(paper, labels)}
      </dl>
    </header>

    <div class="parties">
      ${renderParty(paper.issuer, labels('field.issuer'))}
      ${renderParty(paper.party, paperPartyHeading(paper, labels))}
    </div>

    ${paper.priced ? renderPricedTable(paper, labels) : renderQuantityTable(paper, labels)}

    <div class="footer">
      ${renderTotals(paper, labels)}
    </div>
  </body>
</html>
`;
}

/**
 * The paper stylesheet: the invoice template's rules trimmed to the shapes an
 * operational paper has. Same rule as the fiscal document — logical properties
 * only, no physical direction may appear here.
 */
const PAPER_CSS = `
  @page {
    size: A4;
    margin: 14mm;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    font-family: "Noto Sans", "Noto Naskh Arabic", "Noto Sans Arabic", "DejaVu Sans", sans-serif;
    font-size: 10pt;
    line-height: 1.45;
    color: #101418;
  }

  table {
    border-collapse: collapse;
    width: 100%;
  }

  .numeric {
    text-align: end;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .masthead {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8mm;
    padding-block-end: 4mm;
    border-block-end: 2px solid #101418;
  }

  .document-title {
    margin: 0;
    font-size: 18pt;
    letter-spacing: 0.04em;
  }

  .document-meta {
    display: flex;
    gap: 8mm;
    margin: 0;
  }

  .document-meta dt {
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #5a6472;
  }

  .document-meta dd {
    margin: 0;
    font-size: 11pt;
  }

  .document-number {
    font-variant-numeric: tabular-nums;
  }

  .parties {
    display: flex;
    flex-wrap: wrap;
    gap: 8mm;
    padding-block: 4mm;
  }

  .party {
    flex: 1 1 0;
    min-inline-size: 60mm;
  }

  .party-heading {
    margin: 0 0 1mm;
    font-size: 8pt;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #5a6472;
  }

  .party-name {
    font-weight: 600;
  }

  .party-address {
    color: #38404d;
  }

  .lines {
    margin-block-start: 2mm;
  }

  .lines th,
  .lines td {
    border-block-end: 1px solid #d5dae1;
    padding-block: 1.6mm;
    padding-inline: 2mm;
  }

  .lines thead th {
    font-size: 8pt;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #5a6472;
    border-block-end: 1px solid #101418;
  }

  .totals {
    flex: 0 0 auto;
    min-inline-size: 62mm;
    margin-inline-start: auto;
  }

  .totals th {
    font-weight: 400;
    text-align: start;
    padding-block: 1.2mm;
    padding-inline-end: 4mm;
  }

  .totals-grand th,
  .totals-grand td {
    border-block-start: 1px solid #101418;
    font-weight: 600;
    padding-block-start: 2mm;
  }
`;
