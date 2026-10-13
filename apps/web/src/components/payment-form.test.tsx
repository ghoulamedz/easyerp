/**
 * @vitest-environment jsdom
 *
 * The payment form: the draft carries no allocations by default, the remainder
 * stays unallocated credit, and an over-allocation refusal stays on screen.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaymentForm } from './payment-form';

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
const emptyDocs = { items: [], total: 0, page: 1, pageSize: 25 };

function refs() {
  return async (url: unknown) => {
    const u = String(url);
    if (u === '/api/settings/business') return { ok: true, status: 200, json: async () => profile };
    if (u.startsWith('/api/parties')) return { ok: true, status: 200, json: async () => parties };
    if (u.startsWith('/api/sales/invoices') || u.startsWith('/api/credit-notes'))
      return { ok: true, status: 200, json: async () => emptyDocs };
    throw new Error(`unexpected ${u}`);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PaymentForm', () => {
  it('records the payment with no allocations and returns to the list', async () => {
    const user = userEvent.setup();
    const seen: { url: string; body: unknown }[] = [];
    global.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      if (String(url) === '/api/payments' && init?.method === 'POST') {
        seen.push({ url: String(url), body: JSON.parse(String(init.body)) });
        return { ok: true, status: 201, json: async () => ({ id: 'pay-1' }) };
      }
      return refs()(url);
    }) as unknown as typeof fetch;

    render(<PaymentForm locale="en" />);

    expect(await screen.findByLabelText('Customer')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Amount'), '100');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/en/payments'));
    expect(seen[0]?.body).toMatchObject({
      businessId: 'b-1',
      partyId: 'p-1',
      amount: '100',
      allocations: [],
    });
  });

  it('shows the over-allocation refusal without navigating', async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async (url: unknown) => {
      if (String(url).startsWith('/api/payments')) {
        return {
          ok: false,
          status: 409,
          json: async () => ({
            error: { code: 'CONFLICT', message: 'Allocations exceed the payment amount' },
          }),
        };
      }
      return refs()(url);
    }) as unknown as typeof fetch;

    render(<PaymentForm locale="en" />);

    expect(await screen.findByLabelText('Customer')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Amount'), '100');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Allocations exceed the payment amount',
    );
    expect(push).not.toHaveBeenCalled();
  });
});
