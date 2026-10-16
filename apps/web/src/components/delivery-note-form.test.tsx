/**
 * @vitest-environment jsdom
 *
 * The standalone delivery-note form: references load, the draft submits, and
 * a refusal stays on the screen.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeliveryNoteForm } from './delivery-note-form';

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
const orders = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 25,
};

function refs() {
  return async (url: unknown) => {
    const u = String(url);
    if (u === '/api/settings/business') return { ok: true, status: 200, json: async () => profile };
    if (u.startsWith('/api/parties')) return { ok: true, status: 200, json: async () => parties };
    if (u.startsWith('/api/items')) return { ok: true, status: 200, json: async () => items };
    if (u.startsWith('/api/sales/orders')) return { ok: true, status: 200, json: async () => orders };
    throw new Error(`unexpected ${u}`);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DeliveryNoteForm', () => {
  it('drafts the note and returns to the list', async () => {
    const user = userEvent.setup();
    const seen: { url: string; body: unknown }[] = [];
    global.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      if (String(url) === '/api/sales/delivery-notes' && init?.method === 'POST') {
        seen.push({ url: String(url), body: JSON.parse(String(init.body)) });
        return { ok: true, status: 201, json: async () => ({ id: 'd-1' }) };
      }
      return refs()(url);
    }) as unknown as typeof fetch;

    render(<DeliveryNoteForm locale="en" />);

    expect(await screen.findByLabelText('Customer')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Quantity'));
    await user.type(screen.getByLabelText('Quantity'), '2');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/en/delivery-notes'));
    expect(seen[0]?.body).toEqual({
      businessId: 'b-1',
      partyId: 'p-1',
      lines: [{ itemId: 'i-1', quantity: '2' }],
    });
  });

  it('shows the refusal without navigating', async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async (url: unknown) => {
      if (String(url).startsWith('/api/sales/delivery-notes')) {
        return {
          ok: false,
          status: 422,
          json: async () => ({
            error: { code: 'VALIDATION_FAILED', message: 'Quantity must be positive' },
          }),
        };
      }
      return refs()(url);
    }) as unknown as typeof fetch;

    render(<DeliveryNoteForm locale="en" />);

    expect(await screen.findByLabelText('Customer')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The submitted data is invalid.');
    expect(push).not.toHaveBeenCalled();
  });

  it('prefills the open order lines and submits their link ids', async () => {
    const user = userEvent.setup();
    const seen: { url: string; body: unknown }[] = [];
    const orderCollection = {
      items: [
        {
          id: 'o-1',
          type: 'SALES_ORDER',
          status: 'ISSUED',
          number: 'SO-0001',
          partyId: 'p-1',
          partyName: 'Acme SARL',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 25,
    };
    const orderDetail = {
      id: 'o-1',
      partyId: 'p-1',
      lines: [
        {
          id: 'ol-1',
          itemId: 'i-1',
          quantity: '5.000',
          deliveredQuantity: '2.000',
          description: 'Widget',
        },
        {
          id: 'ol-2',
          itemId: 'i-1',
          quantity: '1.000',
          deliveredQuantity: '1.000',
          description: 'Shipped',
        },
      ],
    };
    global.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      const u = String(url);
      if (u === '/api/sales/delivery-notes' && init?.method === 'POST') {
        seen.push({ url: u, body: JSON.parse(String(init.body)) });
        return { ok: true, status: 201, json: async () => ({ id: 'd-1' }) };
      }
      if (u === '/api/sales/orders')
        return { ok: true, status: 200, json: async () => orderCollection };
      if (u === '/api/sales/orders/o-1')
        return { ok: true, status: 200, json: async () => orderDetail };
      return refs()(url);
    }) as unknown as typeof fetch;

    render(<DeliveryNoteForm locale="en" />);

    expect(await screen.findByLabelText('Customer')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Linked order (optional)'), 'o-1');

    // 5.000 minus 2.000 prefills 3; the fully-delivered line is skipped.
    expect(await screen.findByDisplayValue('3')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Quantity')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/en/delivery-notes'));
    expect(seen[0]?.body).toEqual({
      businessId: 'b-1',
      partyId: 'p-1',
      salesOrderId: 'o-1',
      lines: [{ itemId: 'i-1', quantity: '3', description: 'Widget', salesOrderLineId: 'ol-1' }],
    });
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
    render(<DeliveryNoteForm locale="en" />);
    const cancel = await screen.findByRole('button', { name: 'Cancel' });
    await user.click(cancel);
    expect(push).toHaveBeenCalledWith('/en/delivery-notes');
    expect(posts).toHaveLength(0);
  });
});
