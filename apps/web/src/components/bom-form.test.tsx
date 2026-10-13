/**
 * @vitest-environment jsdom
 *
 * The new BOM form: references load, component lines grow, creation writes
 * the shell then the first version with quantities but no money (ADR 0005),
 * and a refusal stays put.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BomForm } from './bom-form';

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

const items = {
  items: [
    { id: 'i-9', code: 'TABLE', name: 'Table' },
    { id: 'i-1', code: 'LEG', name: 'Leg' },
  ],
  total: 2,
  page: 1,
  pageSize: 25,
};
const units = [{ id: 'u-1', code: 'PCS', allowsFraction: false, isActive: true }];

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(async (url: unknown) => {
    const u = String(url);
    if (u.startsWith('/api/items')) return { ok: true, status: 200, json: async () => items };
    if (u.startsWith('/api/settings/units')) return { ok: true, status: 200, json: async () => units };
    if (u === '/api/production/boms') return { ok: true, status: 201, json: async () => ({ id: 'bom-1' }) };
    if (u === '/api/production/boms/bom-1/versions')
      return { ok: true, status: 201, json: async () => ({ id: 'v-1' }) };
    throw new Error(`unexpected ${u}`);
  }) as unknown as typeof fetch;
});

describe('BomForm', () => {
  it('creates the BOM shell then its first version, then returns to the list', async () => {
    const user = userEvent.setup();
    const seen: { url: string; body: unknown }[] = [];
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      async (url: unknown, init?: RequestInit) => {
        if (init?.method === 'POST') {
          seen.push({ url: String(url), body: JSON.parse(String(init.body)) });
          if (String(url) === '/api/production/boms')
            return { ok: true, status: 201, json: async () => ({ id: 'bom-1' }) };
          return { ok: true, status: 201, json: async () => ({ id: 'v-1' }) };
        }
        if (String(url).startsWith('/api/items'))
          return { ok: true, status: 200, json: async () => items };
        if (String(url).startsWith('/api/settings/units'))
          return { ok: true, status: 200, json: async () => units };
        throw new Error(`unexpected ${String(url)}`);
      },
    );

    render(<BomForm locale="en" />);

    expect(await screen.findByLabelText('Finished item')).toBeInTheDocument();
    expect(await screen.findByLabelText('Component')).toBeInTheDocument();
    expect(await screen.findByLabelText('Base unit')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Quantity'));
    await user.type(screen.getByLabelText('Quantity'), '4');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/en/boms'));
    expect(seen).toHaveLength(2);
    expect(seen[0]).toEqual({ url: '/api/production/boms', body: { finishedItemId: 'i-9' } });
    expect(seen[1]).toEqual({
      url: '/api/production/boms/bom-1/versions',
      body: { bomId: 'bom-1', lines: [{ itemId: 'i-9', quantity: '4', unitOfMeasureId: 'u-1' }] },
    });
  });

  it('grows lines and shows the refusal without navigating', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: unknown) => {
      if (String(url).startsWith('/api/items'))
        return { ok: true, status: 200, json: async () => items };
      if (String(url).startsWith('/api/settings/units'))
        return { ok: true, status: 200, json: async () => units };
      return {
        ok: false,
        status: 422,
        json: async () => ({
          error: { code: 'DUPLICATE_BOM', message: 'A BOM already exists' },
        }),
      };
    });

    render(<BomForm locale="en" />);

    expect(await screen.findByLabelText('Finished item')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add a line' }));
    expect(screen.getAllByLabelText('Quantity')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A BOM already exists');
    expect(push).not.toHaveBeenCalled();
  });
});
