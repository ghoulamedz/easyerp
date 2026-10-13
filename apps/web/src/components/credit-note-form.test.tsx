/**
 * @vitest-environment jsdom
 *
 * The credit-note form: only issued invoices qualify, reversal quantities
 * default to the billed figures, and an overdraw refusal stays put.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreditNoteForm } from './credit-note-form';

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

const profile = { id: 'b-1', displayName: 'My Company', legalName: 'My Company SARL' };
const invoices = {
  items: [
    { id: 'v-draft', number: null, partyName: 'Acme', status: 'DRAFT' },
    { id: 'v-1', number: 'FA-2026-0001', partyName: 'Acme', status: 'ISSUED' },
  ],
  total: 2,
  page: 1,
  pageSize: 25,
};
const detail = {
  id: 'v-1',
  number: 'FA-2026-0001',
  lines: [{ id: 'il-1', itemId: 'i-1', description: 'Widget', quantity: '3' }],
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
    if (u.startsWith('/api/sales/invoices/'))
      return { ok: true, status: 200, json: async () => detail };
    if (u.startsWith('/api/sales/invoices')) return { ok: true, status: 200, json: async () => invoices };
    if (u.startsWith('/api/items')) return { ok: true, status: 200, json: async () => items };
    throw new Error(`unexpected ${u}`);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CreditNoteForm', () => {
  it('offers only issued invoices and drafts the reversal', async () => {
    const user = userEvent.setup();
    const seen: { url: string; body: unknown }[] = [];
    global.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      if (String(url) === '/api/credit-notes' && init?.method === 'POST') {
        seen.push({ url: String(url), body: JSON.parse(String(init.body)) });
        return { ok: true, status: 201, json: async () => ({ id: 'c-1' }) };
      }
      return refs()(url);
    }) as unknown as typeof fetch;

    render(<CreditNoteForm locale="en" />);

    const select = await screen.findByLabelText('Corrected invoice');
    const options = Array.from((select as HTMLSelectElement).options).map((o) => o.value);
    expect(options).toEqual(['v-1']);

    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/en/credit-notes'));
    expect(seen[0]?.body).toEqual({
      businessId: 'b-1',
      invoiceId: 'v-1',
      lines: [{ invoiceLineId: 'il-1', quantity: '3' }],
    });
  });

  it('shows the overdraw refusal without navigating', async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async (url: unknown) => {
      if (String(url).startsWith('/api/credit-notes')) {
        return {
          ok: false,
          status: 409,
          json: async () => ({
            error: { code: 'CONFLICT', message: 'Correcting 9 would overdraw Invoice line il-1' },
          }),
        };
      }
      return refs()(url);
    }) as unknown as typeof fetch;

    render(<CreditNoteForm locale="en" />);

    expect(await screen.findByLabelText('Corrected invoice')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('would overdraw Invoice line');
    expect(push).not.toHaveBeenCalled();
  });
});
