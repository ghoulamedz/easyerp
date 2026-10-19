/**
 * The Customer Invoice HTML template (ADR 0010, ADR 0018).
 *
 * ## Logical properties only
 *
 * Every directional property here is logical: `padding-inline-start`, `border-block-end`,
 * `margin-inline-start`, `text-align: end`, `inset-inline`. No `left`, `right`,
 * `margin-left` or `text-align: right` appears anywhere, because a document that
 * needs a mirrored stylesheet is a document that will ship one direction wrong.
 * Setting `dir` on the root flips all three locales' geometry from one attribute,
 * which is why Arabic is a locale here and not a fork of the template.
 *
 * ## Everything is escaped
 *
 * Item descriptions, party names and addresses are user data and they land inside
 * an HTML document that Chromium then executes. A description of
 * `<img onerror=...>` must render as those characters on a client's invoice, not
 * run. `escapeHtml` is applied to every interpolated value; there is no path that
 * inserts a string without it.
 *
 * ## Fonts are the reader's
 *
 * Nothing renders on the server: the API serves HTML and the visitor's browser
 * prints it, so the Arabic face has to exist on the *reader's* machine. Every
 * stack therefore names an Arabic-capable family before its fallbacks, and
 * `print-contract.test.ts` asserts the family is present — a substitute face is a
 * silently broken join in a client's name, not a layout drift to be noticed later.
 */

import { Decimal } from 'decimal.js';

import type { CustomerInvoiceView, DocumentParty } from './invoice-document.js';
import { statusWord, type DocumentStatus, type Locale } from './terminology.js';
import { SCALE } from '@easyerp/contracts';

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

/**
 * Group an amount for print. `numeric(18,3)` renders with three decimals because
 * TND has three — the column scale and the printed scale are the same number, and
 * a total that loses a millime on the way to paper is a total that will not
 * reconcile against the ledger.
 *
 * Grouping is done here rather than by `Decimal#toFormat`, which this version of
 * decimal.js does not provide. Writing it out also keeps the printed form fixed:
 * a locale-aware formatter would render differently per machine, and two people
 * reading the same invoice on those two machines must read the same digits.
 */
export function formatMoney(value: string): string {
  const fixed = new Decimal(value).toFixed(SCALE, Decimal.ROUND_HALF_UP);
  const negative = fixed.startsWith('-');
  const digits = negative ? fixed.slice(1) : fixed;
  const [whole = '', fraction] = digits.split('.');

  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = fraction === undefined ? grouped : `${grouped}.${fraction}`;

  return negative ? `-${body}` : body;
}

/** A quantity keeps its own scale: `1`, `2.5` and `10` must not all print as `1.000`. */
function formatQuantity(value: string): string {
  return new Decimal(value).toFixed(SCALE).replace(/\.?0+$/, '');
}

/**
 * The word across a paper that is not an issued document, so a draft never looks
 * like a filed invoice. Logical properties only — the Arabic page mirrors with
 * `dir="rtl"` — and fixed positioning, so it floats over every printed page
 * without moving a line of the table.
 */
function watermarkHtml(status: DocumentStatus, locale: Locale): string {
  const word = statusWord(status, locale);
  if (word === null) return '';
  return `<div class="watermark" aria-hidden="true">${escapeHtml(word)}</div>`;
}

function renderParty(party: DocumentParty, heading: string): string {
  const address = party.addressLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('');

  return `
      <section class="party">
        <h2 class="party-heading">${escapeHtml(heading)}</h2>
        <div class="party-name">${escapeHtml(party.displayName)}</div>
        ${
          // Both sides, not just the issuer: a fiscal invoice that does not name the
          // Customer's tax identifier cannot support the deduction it claims, and the
          // operational papers have printed it since they were written.
          party.taxIdentifier !== ''
            ? `<div class="party-address">${escapeHtml(party.taxIdentifier)}</div>`
            : ''
        }
        <div class="party-address">${address}</div>
      </section>`;
}

/**
 * The VAT section, which differs by regime in kind rather than in detail: a
 * `STANDARD` document prints the per-rate breakdown a tax authority expects, and
 * an `EXEMPT` document prints the mention instead and no breakdown at all. Both
 * shapes are exercised in all three locales, because two shapes that only ever
 * print in French have not been laid out at all.
 */
function renderVatSection(invoice: CustomerInvoiceView): string {
  const labels = invoice.labels;

  if (invoice.vatRegime === 'EXEMPT') {
    return `
      <section class="vat vat-exempt">
        <h2>${escapeHtml(labels('vat.exemptHeading'))}</h2>
        <p>${escapeHtml(labels('vat.exemptMention'))}</p>
      </section>`;
  }

  if (invoice.taxGroups.length === 0) {
    return '';
  }

  const rows = invoice.taxGroups
    .map(
      (group) => `
          <tr>
            <td class="numeric">${escapeHtml(group.rate)}%</td>
            <td class="numeric">${escapeHtml(formatMoney(group.base))}</td>
            <td class="numeric">${escapeHtml(formatMoney(group.amount))}</td>
          </tr>`,
    )
    .join('');

  return `
      <section class="vat">
        <h2>${escapeHtml(labels('field.vatBreakdown'))}</h2>
        <table class="vat-table">
          <thead>
            <tr>
              <th class="numeric">${escapeHtml(labels('field.taxRate'))}</th>
              <th class="numeric">${escapeHtml(labels('field.taxBase'))}</th>
              <th class="numeric">${escapeHtml(labels('field.taxAmount'))}</th>
            </tr>
          </thead>
          <tbody>${rows}
          </tbody>
        </table>
      </section>`;
}

function renderTotals(invoice: CustomerInvoiceView): string {
  const labels = invoice.labels;

  // Stamp duty and withholding are separate lines (ADR 0011): neither is VAT and
  // neither belongs inside the gross total a client reconciles against their
  // payment. They print below it or not at all. FODEC is the same kind of
  // separate line, except it prints above the gross (research §2: line-level,
  // before VAT) and only when non-zero, so documents without FODEC render
  // byte-identical to before. The label is the statutory acronym itself, which
  // is locale-invariant, so no terminology code is needed.
  const optionalLine = (value: string | null, label: string): string =>
    value === null
      ? ''
      : `
          <tr>
            <th scope="row">${escapeHtml(label)}</th>
            <td class="numeric">${escapeHtml(formatMoney(value))}</td>
          </tr>`;

  const fodecLine = (value: string | null): string =>
    value === null || new Decimal(value).isZero()
      ? ''
      : `
          <tr>
            <th scope="row">${escapeHtml('FODEC')}</th>
            <td class="numeric">${escapeHtml(formatMoney(value))}</td>
          </tr>`;

  return `
      <table class="totals">
        <tbody>
          <tr>
            <th scope="row">${escapeHtml(labels('field.subtotal'))}</th>
            <td class="numeric">${escapeHtml(formatMoney(invoice.net))}</td>
          </tr>
          ${fodecLine(invoice.fodec)}
          ${
            invoice.vatRegime === 'STANDARD'
              ? `
          <tr>
            <th scope="row">${escapeHtml(labels('field.totalTax'))}</th>
            <td class="numeric">${escapeHtml(formatMoney(invoice.tax))}</td>
          </tr>`
              : ''
          }
          <tr class="totals-grand">
            <th scope="row">${escapeHtml(labels('field.totalGross'))}</th>
            <td class="numeric">${escapeHtml(formatMoney(invoice.gross))}</td>
          </tr>
          ${optionalLine(invoice.stampDuty, labels('field.stampDuty'))}
          ${optionalLine(invoice.withholdingTax, labels('field.withholdingTax'))}
        </tbody>
      </table>`;
}

export function renderInvoiceHtml(invoice: CustomerInvoiceView): string {
  const labels = invoice.labels;
  const titleLabel =
    invoice.kind === 'CREDIT_NOTE'
      ? labels('document.creditNote')
      : labels('document.customerInvoice');

  const header = `
      <tr>
        <th>${escapeHtml(labels('field.description'))}</th>
        <th class="numeric">${escapeHtml(labels('field.quantity'))}</th>
        <th class="numeric">${escapeHtml(labels('field.unitPrice'))}</th>
        <th class="numeric">${escapeHtml(labels('field.net'))}</th>
        <th class="numeric">${escapeHtml(labels('field.taxRate'))}</th>
        <th class="numeric">${escapeHtml(labels('field.taxAmount'))}</th>
        <th class="numeric">${escapeHtml(labels('field.gross'))}</th>
      </tr>`;

  const rows = invoice.lines
    .map(
      (line) => `
          <tr>
            <td>${escapeHtml(line.description)}</td>
            <td class="numeric">${escapeHtml(formatQuantity(line.quantity))}</td>
            <td class="numeric">${escapeHtml(formatMoney(line.unitPrice))}</td>
            <td class="numeric">${escapeHtml(formatMoney(line.net))}</td>
            <td class="numeric">${escapeHtml(line.taxRate)}%</td>
            <td class="numeric">${escapeHtml(formatMoney(line.taxAmount))}</td>
            <td class="numeric">${escapeHtml(formatMoney(line.gross))}</td>
          </tr>`,
    )
    .join('');

  // A Credit Note states which Invoice it corrects; the meta row is part of its
  // field set, present only when the document is one. An Invoice prints the same
  // markup, so the branch is a row and not a second template.
  const correctedRow =
    invoice.kind === 'CREDIT_NOTE' && invoice.correctedNumber !== null
      ? `
        <div>
          <dt>${escapeHtml(labels('field.corrects'))}</dt>
          <dd class="document-number">${escapeHtml(invoice.correctedNumber)}</dd>
        </div>`
      : '';

  return `<!doctype html>
<html lang="${escapeHtml(invoice.locale)}" dir="${escapeHtml(invoice.direction)}">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(titleLabel)}</title>
    <style>${INVOICE_CSS}</style>
  </head>
  <body>
    ${watermarkHtml(invoice.status, invoice.locale)}
    <header class="masthead">
      <h1 class="document-title">${escapeHtml(titleLabel)}</h1>
      <dl class="document-meta">
        <div>
          <dt>${escapeHtml(labels('field.number'))}</dt>
          <dd class="document-number">${escapeHtml(invoice.number)}</dd>
        </div>
        <div>
          <dt>${escapeHtml(labels('field.issuedAt'))}</dt>
          <dd>${escapeHtml(invoice.issuedAt)}</dd>
        </div>${correctedRow}
      </dl>
    </header>

    <div class="parties">
      ${renderParty(invoice.issuer, labels('field.issuer'))}
      ${renderParty(invoice.party, labels('field.party'))}
    </div>

    <table class="lines">
      <thead>${header}</thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="footer">
      ${renderVatSection(invoice)}
      ${renderTotals(invoice)}
    </div>
  </body>
</html>
`;
}

/**
 * No directional physical property may be added to this stylesheet: `dir` on the
 * root is what mirrors the page, and `print-contract.test.ts` fails on a `left`.
 */
const INVOICE_CSS = `
/* A draft or cancelled paper says so, across the page, in the same ink as the
   rules: readable on paper, invisible under the figures it must not obscure. */
.watermark {
  position: fixed;
  inset-block-start: 34%;
  inset-inline-start: 50%;
  transform: translate(-50%, -50%) rotate(-24deg);
  font-size: 96pt;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: rgba(0, 0, 0, 0.09);
  border: 8px solid rgba(0, 0, 0, 0.09);
  padding: 0.05em 0.2em;
  border-radius: 12px;
  white-space: nowrap;
  z-index: 0;
}

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
  .lines td,
  .vat-table th,
  .vat-table td {
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

  .footer {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 8mm;
    margin-block-start: 6mm;
  }

  .vat {
    flex: 1 1 0;
    min-inline-size: 70mm;
  }

  .vat h2 {
    margin: 0 0 1mm;
    font-size: 8pt;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #5a6472;
  }

  .vat-exempt p {
    margin: 0;
    font-style: italic;
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
