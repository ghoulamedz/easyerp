/**
 * @vitest-environment jsdom
 *
 * The new-Item form as a person uses it: reference lists load, the draft
 * submits, and a refusal names itself instead of vanishing.
 */

import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ItemUnifiedForm } from './item-unified';

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

const units = [{ id: 'u-pcs', code: 'PCS', allowsFraction: false, isActive: true }];
const rates = [
  {
    id: 'r-19',
    code: 'TVA19',
    rate: '0.19',
    activeFrom: '2024-01-01',
    activeTo: null,
    isActive: true,
  },
];

function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  global.fetch = vi.fn(async (url: unknown, init?: unknown) => ({
    ok: true,
    status: 200,
    json: async () => handler(String(url), (init ?? {}) as RequestInit),
  })) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ItemUnifiedForm', () => {
  it('loads reference lists and creates the item, then returns to the list', async () => {
    const user = userEvent.setup();
    mockFetch((url, init) => {
      if (url === '/api/settings/units' && (!init?.method || init.method === 'GET')) return units;
      if (url === '/api/settings/tax-rates') return rates;
      if (url === '/api/items') return { id: 'i-1' };
      throw new Error(`unexpected ${init?.method} ${url}`);
    });

    render(<ItemUnifiedForm locale="en" />);

    expect(await screen.findByLabelText('Item code')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Item code'), 'WIDGET');
    await user.type(screen.getByLabelText('Name'), 'Widget');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/en/items'));
  });

  it('posts fodecSubject when the FODEC box is checked', async () => {
    const user = userEvent.setup();
    let posted: Record<string, unknown> | null = null;
    mockFetch((url, init) => {
      if (url === '/api/settings/units' && (!init?.method || init.method === 'GET')) return units;
      if (url === '/api/settings/tax-rates') return rates;
      if (url === '/api/items') {
        posted = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return { id: 'i-1' };
      }
      throw new Error(`unexpected ${init?.method} ${url}`);
    });

    render(<ItemUnifiedForm locale="en" />);

    expect(await screen.findByLabelText('Item code')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Item code'), 'WIDGET');
    await user.type(screen.getByLabelText('Name'), 'Widget');
    await user.click(screen.getByLabelText('FODEC-applicable'));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/en/items'));
    expect(posted).toMatchObject({ fodecSubject: true });
  });

  it('shows the refusal instead of navigating away', async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async (url: unknown) => {
      if (String(url) === '/api/settings/units') {
        return { ok: true, status: 200, json: async () => units };
      }
      if (String(url) === '/api/settings/tax-rates') {
        return { ok: true, status: 200, json: async () => rates };
      }
      return {
        ok: false,
        status: 409,
        json: async () => ({ error: { code: 'CONFLICT', message: 'Duplicate Item code: WIDGET' } }),
      };
    }) as unknown as typeof fetch;

    render(<ItemUnifiedForm locale="en" />);

    expect(await screen.findByLabelText('Item code')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Item code'), 'WIDGET');
    await user.type(screen.getByLabelText('Name'), 'Widget');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The action conflicts with the current state.');
    expect(push).not.toHaveBeenCalled();
  });

  it('sends the initial quantity on create', async () => {
    const user = userEvent.setup();
    let posted: Record<string, unknown> | null = null;
    mockFetch((url, init) => {
      if (url === '/api/settings/units' && (!init?.method || init.method === 'GET')) return units;
      if (url === '/api/settings/tax-rates') return rates;
      if (url === '/api/items') {
        posted = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return { id: 'i-1' };
      }
      throw new Error(`unexpected ${init?.method} ${url}`);
    });

    render(<ItemUnifiedForm locale="en" />);

    expect(await screen.findByLabelText('Item code')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Item code'), 'WIDGET');
    await user.type(screen.getByLabelText('Name'), 'Widget');
    await user.clear(screen.getByLabelText('Initial quantity'));
    await user.type(screen.getByLabelText('Initial quantity'), '12.5');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/en/items'));
    expect(posted).toMatchObject({ initialQuantity: '12.5' });
  });

  it('shows the on-hand quantity read-only on an edit, and never patches it', async () => {
    // Stock moves through the ledger and only through the ledger (ADR 0004), so the
    // edit form shows what the Item holds and refuses to write it. The server's
    // strict update schema is the other half of the same rule.
    const user = userEvent.setup();
    let patched: Record<string, unknown> | null = null;
    mockFetch((url, init) => {
      if (url === '/api/settings/units') return units;
      if (url === '/api/settings/tax-rates') return rates;
      if (url === '/api/items/i-1') {
        if (init?.method === 'PATCH') {
          patched = JSON.parse(String(init.body)) as Record<string, unknown>;
          return { id: 'i-1' };
        }
        return {
          id: 'i-1',
          code: 'WIDGET',
          name: 'Widget',
          description: null,
          itemType: 'FINISHED_GOOD',
          baseUnitId: 'u-pcs',
          purchaseUnitId: null,
          saleUnitId: null,
          taxRateId: 'r-19',
          fodecSubject: false,
          salePrice: '10.000',
          purchasePrice: '4.000',
          reorderPoint: null,
          isService: false,
          isActive: true,
          customFields: {},
        };
      }
      if (url === '/api/inventory/stock/entries/i-1') {
        return [
          {
            id: 'e-1',
            itemId: 'i-1',
            reason: 'OPENING_BALANCE',
            direction: 'IN',
            quantity: '12.500',
            balanceBefore: '0.000',
            balanceAfter: '12.500',
            createdAt: '2026-10-20T00:00:00.000Z',
          },
        ];
      }
      throw new Error(`unexpected ${init?.method} ${url}`);
    });

    render(<ItemUnifiedForm locale="en" id="i-1" />);

    const onHand = await screen.findByLabelText('On hand');
    // Printed as stored: three decimals, the same scale the ledger keeps.
    expect(onHand).toHaveValue('12.500');
    expect(onHand).toBeDisabled();
    expect(screen.queryByLabelText('Initial quantity')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/en/items'));
    expect(patched).not.toBeNull();
    expect(patched).not.toHaveProperty('initialQuantity');
  });

  it('cancel returns to the list without creating anything', async () => {
    const user = userEvent.setup();
    const fetchMock = global.fetch as Mock;
    const baseImpl = fetchMock.getMockImplementation();
    const posts: string[] = [];
    fetchMock.mockImplementation(async (url: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push(String(url));
        return { ok: true, status: 201, json: async () => ({ id: 'x-1' }) };
      }
      return baseImpl!(url, init);
    });
    render(<ItemUnifiedForm locale="en" />);
    const cancel = await screen.findByRole('button', { name: 'Cancel' });
    await user.click(cancel);
    expect(push).toHaveBeenCalledWith('/en/items');
    expect(posts).toHaveLength(0);
  });
});
