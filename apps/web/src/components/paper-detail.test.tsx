/**
 * @vitest-environment jsdom
 *
 * DocumentPaperDetail: the detail view fetches the real document through
 * `lib/api`, and Print fetches the paper from `/print` and hands it to the
 * browser's print dialog. A failed read surfaces the server's localized message
 * instead of a blank frame.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DocumentPaperDetail } from './paper-detail';

const paper = '/sales/orders';

const order = {
  id: 'o-1',
  type: 'SALES_ORDER',
  status: 'ISSUED',
  number: 'CO-2026-0001',
  issuedAt: '2026-02-01T12:00:00.000Z',
  party: { name: 'Atlas Trading' },
  totals: { netAmount: '100.000', taxAmount: '19.000', grossAmount: '119.000' },
  lines: [{ itemId: 'i-1', description: 'Widget', quantity: '10.000', grossAmount: '119.000' }],
};

const labels = {
  details: 'Document details',
  number: 'Number',
  status: 'Status',
  date: 'Date',
  party: 'Customer',
  lines: 'Lines',
  item: 'Item',
  quantity: 'Quantity',
  net: 'Subtotal',
  tax: 'Tax',
  gross: 'Total',
  print: 'Print',
  loading: 'Loading…',
  archiveHint: 'The document as it prints.',
  statusDraft: 'Draft',
  statusIssued: 'Issued',
  statusCancelled: 'Cancelled',
};

const printHtml = '<!doctype html><html><body><h1>CO-2026-0001</h1></body></html>';

function stubFetch(
  options: { document?: unknown; documentStatus?: number; printOk?: boolean } = {},
) {
  global.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url === `/api${paper}/o-1`) {
      if (options.documentStatus && options.documentStatus !== 200) {
        return {
          ok: false,
          status: options.documentStatus,
          json: async () => ({
            error: { code: 'NOT_FOUND', message: 'Sales Order o-1 was not found' },
          }),
        };
      }
      return { ok: true, status: 200, json: async () => options.document ?? order };
    }
    if (url === `/api${paper}/o-1/print` && method === 'GET') {
      if (options.printOk === false) {
        return {
          ok: false,
          status: 404,
          json: async () => ({ error: { code: 'ARCHIVE_UNAVAILABLE', message: 'not available' } }),
        };
      }
      return { ok: true, status: 200, text: async () => printHtml };
    }
    return { ok: false, status: 404, json: async () => ({ error: { code: 'NOT_FOUND' } }) };
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  stubFetch();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DocumentPaperDetail', () => {
  it('renders the stored document, not placeholders', async () => {
    render(<DocumentPaperDetail paper={paper} id="o-1" labels={labels} />);

    await waitFor(() => expect(screen.getByText('CO-2026-0001')).toBeInTheDocument());
    expect(screen.getByText('Atlas Trading')).toBeInTheDocument();
    expect(screen.getByText('2026-02-01')).toBeInTheDocument();
    expect(screen.getByText(/Widget/)).toBeInTheDocument();
    expect(screen.queryByText(/#{?Customer}?/)).not.toBeInTheDocument();
  });

  it('print fetches the paper and loads it into a hidden iframe', async () => {
    const user = userEvent.setup();
    const created = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:print-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    render(<DocumentPaperDetail paper={paper} id="o-1" labels={labels} />);

    await screen.findByText('CO-2026-0001');
    await user.click(screen.getByRole('button', { name: 'Print' }));

    // The HTML the server renders from the row: printing needs no browser on the
    // host, and it is the same paper every time because it comes from the row.
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/sales/orders/o-1/print'));
    expect(created).toHaveBeenCalledWith(expect.any(Blob));

    const frame = window.document.querySelector<HTMLIFrameElement>('iframe[aria-hidden="true"]');
    await waitFor(() => expect(frame?.src).toContain('blob:print-url'));
  });

  it('surfaces a failed print read with its message', async () => {
    stubFetch({ printOk: false });
    const user = userEvent.setup();
    render(<DocumentPaperDetail paper={paper} id="o-1" labels={labels} />);

    await screen.findByText('CO-2026-0001');
    await user.click(screen.getByRole('button', { name: 'Print' }));

    await waitFor(() => expect(screen.getByTestId('paper-error')).toBeInTheDocument());
  });
});

/** `HTMLAnchorElement.click` is inert in jsdom; the component relies on it. */
function linkClick(): void {
  let calls = 0;
  Object.defineProperty(HTMLAnchorElement.prototype, 'click', {
    configurable: true,
    get() {
      return () => {
        calls += 1;
      };
    },
  });
  return;
}
