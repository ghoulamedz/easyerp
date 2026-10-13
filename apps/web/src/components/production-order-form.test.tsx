/**
 * @vitest-environment jsdom
 *
 * The new production-order form: references load, the BOM version resolves
 * through the detail call, lines grow, the draft submits without a single
 * price travelling (ADR 0005), and a refusal stays put.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductionOrderForm } from './production-order-form';

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

const profile = { id: 'b-1', displayName: 'My Company', legalName: 'My Company SARL' };
const boms = [{ id: 'bom-1', finishedItemId: 'i-9', finishedItemCode: 'TABLE', finishedItemName: 'Table' }];
const bomDetail = {
  id: 'bom-1',
  finishedItemId: 'i-9',
  versions: [{ id: 'v-1', version: 1, createdAt: '2026-01-01T00:00:00.000Z', lines: [] }],
  createdAt: '2026-01-01T00:00:00.000Z',
};
const items = {
  items: [{ id: 'i-1', code: 'LEG', name: 'Leg' }],
  total: 1,
  page: 1,
  pageSize: 25,
};

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(async (url: unknown) => {
    const u = String(url);
    if (u === '/api/settings/business') return { ok: true, status: 200, json: async () => profile };
    if (u === '/api/production/boms') return { ok: true, status: 200, json: async () => boms };
    if (u === '/api/production/boms/bom-1') return { ok: true, status: 200, json: async () => bomDetail };
    if (u.startsWith('/api/items')) return { ok: true, status: 200, json: async () => items };
    if (u === '/api/production/orders') return { ok: true, status: 201, json: async () => ({ id: 'o-1' }) };
    throw new Error(`unexpected ${u}`);
  }) as unknown as typeof fetch;
});

describe('ProductionOrderForm', () => {
  it('drafts the order with BOM version, item and quantity, then returns to the list', async () => {
    const user = userEvent.setup();
    const seen: { url: string; body: unknown }[] = [];
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      async (url: unknown, init?: RequestInit) => {
        if (String(url) === '/api/production/orders' && init?.method === 'POST') {
          seen.push({ url: String(url), body: JSON.parse(String(init.body)) });
          return { ok: true, status: 201, json: async () => ({ id: 'o-1' }) };
        }
        if (String(url) === '/api/settings/business')
          return { ok: true, status: 200, json: async () => profile };
        if (String(url) === '/api/production/boms')
          return { ok: true, status: 200, json: async () => boms };
        if (String(url) === '/api/production/boms/bom-1')
          return { ok: true, status: 200, json: async () => bomDetail };
        if (String(url).startsWith('/api/items'))
          return { ok: true, status: 200, json: async () => items };
        throw new Error(`unexpected ${String(url)}`);
      },
    );

    render(<ProductionOrderForm locale="en" />);

    expect(await screen.findByLabelText('Finished item')).toBeInTheDocument();
    expect(await screen.findByLabelText('BOM version')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Quantity'));
    await user.type(screen.getByLabelText('Quantity'), '3');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/en/production/orders'));
    expect(seen).toHaveLength(1);
    expect(seen[0]?.body).toEqual({
      businessId: 'b-1',
      bomVersionId: 'v-1',
      lines: [{ itemId: 'i-1', quantity: '3' }],
    });
  });

  it('grows lines and shows the refusal without navigating', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: unknown) => {
      if (String(url) === '/api/settings/business')
        return { ok: true, status: 200, json: async () => profile };
      if (String(url) === '/api/production/boms')
        return { ok: true, status: 200, json: async () => boms };
      if (String(url) === '/api/production/boms/bom-1')
        return { ok: true, status: 200, json: async () => bomDetail };
      if (String(url).startsWith('/api/items'))
        return { ok: true, status: 200, json: async () => items };
      return {
        ok: false,
        status: 409,
        json: async () => ({
          error: { code: 'UNKNOWN_BOM_VERSION', message: 'Unknown BOM version' },
        }),
      };
    });

    render(<ProductionOrderForm locale="en" />);

    expect(await screen.findByLabelText('Finished item')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add a line' }));
    expect(screen.getAllByLabelText('Quantity')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Unknown BOM version');
    expect(push).not.toHaveBeenCalled();
  });
});
