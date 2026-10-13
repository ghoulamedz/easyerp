/**
 * @vitest-environment jsdom
 *
 * The new goods-receipt form: references load, lines grow, the receipt submits
 * without a single price travelling (ADR 0005), and a refusal stays put.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GoodsReceiptForm } from './goods-receipt-form';

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

const profile = { id: 'b-1', displayName: 'My Company', legalName: 'My Company SARL' };
const parties = {
  items: [{ id: 'p-1', code: 'SUP', name: 'Supplier SARL', roles: ['SUPPLIER'] }],
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

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(async (url: unknown) => {
    const u = String(url);
    if (u === '/api/settings/business') return { ok: true, status: 200, json: async () => profile };
    if (u.startsWith('/api/parties')) return { ok: true, status: 200, json: async () => parties };
    if (u.startsWith('/api/items')) return { ok: true, status: 200, json: async () => items };
    if (u === '/api/purchasing/receipts') return { ok: true, status: 201, json: async () => ({ id: 'r-1' }) };
    throw new Error(`unexpected ${u}`);
  }) as unknown as typeof fetch;
});

describe('GoodsReceiptForm', () => {
  it('drafts the receipt with supplier, item and quantity, then returns to the list', async () => {
    const user = userEvent.setup();
    const seen: { url: string; body: unknown }[] = [];
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      async (url: unknown, init?: RequestInit) => {
        if (String(url) === '/api/purchasing/receipts' && init?.method === 'POST') {
          seen.push({ url: String(url), body: JSON.parse(String(init.body)) });
          return { ok: true, status: 201, json: async () => ({ id: 'r-1' }) };
        }
        if (String(url) === '/api/settings/business')
          return { ok: true, status: 200, json: async () => profile };
        if (String(url).startsWith('/api/parties'))
          return { ok: true, status: 200, json: async () => parties };
        if (String(url).startsWith('/api/items'))
          return { ok: true, status: 200, json: async () => items };
        throw new Error(`unexpected ${String(url)}`);
      },
    );

    render(<GoodsReceiptForm locale="en" />);

    expect(await screen.findByLabelText('Supplier')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Supplier'), 'p-1');
    await user.clear(screen.getByLabelText('Quantity'));
    await user.type(screen.getByLabelText('Quantity'), '3');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/en/purchasing/receipts'));
    expect(seen).toHaveLength(1);
    expect(seen[0]?.body).toEqual({
      businessId: 'b-1',
      partyId: 'p-1',
      lines: [{ itemId: 'i-1', quantity: '3' }],
    });
  });

  it('grows lines and shows the refusal without navigating', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: unknown) => {
      if (String(url) === '/api/settings/business')
        return { ok: true, status: 200, json: async () => profile };
      if (String(url).startsWith('/api/parties'))
        return { ok: true, status: 200, json: async () => parties };
      if (String(url).startsWith('/api/items'))
        return { ok: true, status: 200, json: async () => items };
      return {
        ok: false,
        status: 409,
        json: async () => ({
          error: { code: 'INVALID_STATE', message: 'Refused' },
        }),
      };
    });

    render(<GoodsReceiptForm locale="en" />);

    expect(await screen.findByLabelText('Supplier')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add a line' }));
    expect(screen.getAllByLabelText('Quantity')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Refused');
    expect(push).not.toHaveBeenCalled();
  });
});
