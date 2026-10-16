/**
 * @vitest-environment jsdom
 *
 * The customer-invoice form: the draft carries the document locale, no amounts
 * travel, and a refusal stays on the screen.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomerInvoiceForm } from './customer-invoice-form';

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

const profile = { id: 'b-1', displayName: 'My Company', legalName: 'My Company SARL' };
const parties = {
  items: [{ id: 'p-1', code: 'ACME', name: 'Acme SARL', roles: ['CUSTOMER'] }],
  total: 1,
  page: 1,
  pageSize: 25,
};
const items = {
  items: [{ id: 'i-1', code: 'WIDGET', name: 'Widget' }],
  total: 1,
  page: 1,
  pageSize: 25,
};

function refs() {
  return async (url: unknown) => {
    const u = String(url);
    if (u === '/api/settings/business') return { ok: true, status: 200, json: async () => profile };
    if (u.startsWith('/api/parties')) return { ok: true, status: 200, json: async () => parties };
    if (u.startsWith('/api/items')) return { ok: true, status: 200, json: async () => items };
    throw new Error(`unexpected ${u}`);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CustomerInvoiceForm', () => {
  it('drafts the invoice with the document locale and returns to the list', async () => {
    const user = userEvent.setup();
    const seen: { url: string; body: unknown }[] = [];
    global.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      if (String(url) === '/api/sales/invoices' && init?.method === 'POST') {
        seen.push({ url: String(url), body: JSON.parse(String(init.body)) });
        return { ok: true, status: 201, json: async () => ({ id: 'v-1' }) };
      }
      return refs()(url);
    }) as unknown as typeof fetch;

    render(<CustomerInvoiceForm locale="fr" />);

    expect(await screen.findByLabelText('Client')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Créer' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/fr/customer-invoices'));
    expect(seen[0]?.body).toEqual({
      businessId: 'b-1',
      partyId: 'p-1',
      locale: 'fr',
      lines: [{ itemId: 'i-1', quantity: '1' }],
    });
  });

  it('shows the refusal without navigating', async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async (url: unknown) => {
      if (String(url).startsWith('/api/sales/invoices')) {
        return {
          ok: false,
          status: 422,
          json: async () => ({
            error: { code: 'VALIDATION_FAILED', message: 'An invoice needs a line' },
          }),
        };
      }
      return refs()(url);
    }) as unknown as typeof fetch;

    render(<CustomerInvoiceForm locale="en" />);

    expect(await screen.findByLabelText('Customer')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The submitted data is invalid.');
    expect(push).not.toHaveBeenCalled();
  });

  it('cancel returns to the list without creating anything', async () => {
    const user = userEvent.setup();
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const baseImpl = fetchMock.getMockImplementation();
    const posts: string[] = [];
    fetchMock.mockImplementation(async (url: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push(String(url));
        return { ok: true, status: 201, json: async () => ({ id: 'x-1' }) };
      }
      return baseImpl!(url, init);
    });
    render(<CustomerInvoiceForm locale="en" />);
    const cancel = await screen.findByRole('button', { name: 'Cancel' });
    await user.click(cancel);
    expect(push).toHaveBeenCalledWith('/en/customer-invoices');
    expect(posts).toHaveLength(0);
  });
});
