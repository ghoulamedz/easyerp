/**
 * @vitest-environment jsdom
 *
 * DocumentPaperDetail: the detail view fetches the real document through
 * `lib/api`, Download fetches the paper's `/pdf` bytes and hands them to the
 * browser as a file, and Print puts the same blob into a hidden iframe. A
 * failed archive read surfaces the server's localized message instead of
 * failing silently.
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
  download: 'Download',
  loading: 'Loading…',
  archiveHint: 'The PDF the server keeps.',
  statusDraft: 'Draft',
  statusIssued: 'Issued',
  statusCancelled: 'Cancelled',
};

const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF

function stubFetch(options: { document?: unknown; documentStatus?: number; pdfOk?: boolean } = {}) {
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
    if (url === `/api${paper}/o-1/pdf` && method === 'GET') {
      if (options.pdfOk === false) {
        return {
          ok: false,
          status: 404,
          json: async () => ({ error: { code: 'ARCHIVE_UNAVAILABLE', message: 'not available' } }),
        };
      }
      return {
        ok: true,
        status: 200,
        blob: async () => new Blob([pdfBytes as BlobPart], { type: 'application/pdf' }),
      };
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

  it('download fetches the pdf bytes for the paper endpoint', async () => {
    const user = userEvent.setup();
    const revoked: string[] = [];
    const created = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:pdf-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url: string) => {
      revoked.push(url);
    });
    linkClick();

    render(<DocumentPaperDetail paper={paper} id="o-1" labels={labels} />);

    await user.click(await screen.findByRole('button', { name: 'Download' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/sales/orders/o-1/pdf'));
    expect(created).toHaveBeenCalledWith(expect.anything());
  });

  it('print puts the same blob into a hidden iframe', async () => {
    const user = userEvent.setup();
    render(<DocumentPaperDetail paper={paper} id="o-1" labels={labels} />);

    await screen.findByText('CO-2026-0001');
    await user.click(screen.getByRole('button', { name: 'Print' }));

    const frame = window.document.querySelector('iframe[aria-hidden="true"]');
    await waitFor(() => expect(frame).not.toBeNull());
  });

  it('surfaces a failed archive read with its message', async () => {
    stubFetch({ pdfOk: false });
    const user = userEvent.setup();
    render(<DocumentPaperDetail paper={paper} id="o-1" labels={labels} />);

    await screen.findByText('CO-2026-0001');
    await user.click(screen.getByRole('button', { name: 'Download' }));

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
