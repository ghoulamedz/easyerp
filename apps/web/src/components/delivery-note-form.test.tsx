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

    expect(await screen.findByRole('alert')).toHaveTextContent('Quantity must be positive');
    expect(push).not.toHaveBeenCalled();
  });
});
