/**
 * @vitest-environment jsdom
 *
 * Tax Rates settings as a person uses them: the rows render with their
 * effective window, the form posts the window the server prices from, a
 * Retire flips the row to `{ isActive: false }` instead of deleting it, and
 * a refusal names itself instead of vanishing.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaxRatesList } from './tax-rates-list';

const MANAGE = ['tax-rate:manage'];

const rows = [
  {
    id: 'r-19',
    code: 'TVA19',
    rate: '19',
    activeFrom: '2024-01-01',
    activeTo: null,
    isActive: true,
  },
  {
    id: 'r-07',
    code: 'TVA07',
    rate: '7',
    activeFrom: '2024-01-01',
    activeTo: '2024-12-31',
    isActive: false,
  },
];

function sessionUserWith(permissions: string[]) {
  return {
    id: 'u-1',
    email: 'owner@example.test',
    displayName: 'Owner',
    isActive: true,
    roleIds: ['r-admin'],
    permissions,
  };
}

interface StubOptions {
  permissions: string[];
  onPost?: (body: unknown) => Promise<unknown>;
  onPatch?: (url: string, body: unknown) => Promise<unknown>;
}

function stubFetch({ permissions, onPost, onPatch }: StubOptions) {
  let listCalls = 0;
  const posts: Array<{ url: string; body: unknown }> = [];
  const patches: Array<{ url: string; body: unknown }> = [];
  global.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url === '/api/users/me') {
      return { ok: true, status: 200, json: async () => sessionUserWith(permissions) };
    }
    if (url === '/api/settings/tax-rates' && method === 'GET') {
      listCalls += 1;
      return { ok: true, status: 200, json: async () => rows };
    }
    if (url === '/api/settings/tax-rates' && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as unknown;
      posts.push({ url, body });
      return (
        onPost?.(body) ?? {
          ok: true,
          status: 201,
          json: async () => ({
            id: 'r-new',
            code: 'TVA13',
            rate: '13',
            activeFrom: '2025-01-01',
            activeTo: null,
            isActive: true,
          }),
        }
      );
    }
    if (url.startsWith('/api/settings/tax-rates/') && method === 'PATCH') {
      const body = JSON.parse(String(init?.body)) as unknown;
      patches.push({ url, body });
      return (
        onPatch?.(url, body) ?? {
          ok: true,
          status: 200,
          json: async () => ({ ...rows[0], isActive: false }),
        }
      );
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  }) as unknown as typeof fetch;
  return {
    listCalls: () => listCalls,
    posts: () => posts,
    patches: () => patches,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TaxRatesList', () => {
  it('renders every row with its effective window', async () => {
    stubFetch({ permissions: MANAGE });
    render(<TaxRatesList locale="en" />);

    expect(await screen.findByText('TVA19')).toBeInTheDocument();
    expect(screen.getByText('TVA07')).toBeInTheDocument();
    expect(screen.getByText('2024-12-31')).toBeInTheDocument();
    // The active row offers Retire; the already-retired row offers nothing.
    expect(screen.getAllByRole('button', { name: 'Retire' })).toHaveLength(1);
  });

  it('posts the new rate and refetches the list', async () => {
    const user = userEvent.setup();
    const state = stubFetch({ permissions: MANAGE });
    render(<TaxRatesList locale="en" />);

    await screen.findByText('TVA19');

    await user.type(screen.getByLabelText('Code'), 'TVA13');
    await user.type(screen.getByLabelText('Tax rate'), '13');
    fireEvent.change(screen.getByLabelText('Effective from'), {
      target: { value: '2025-01-01' },
    });
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(state.posts()).toHaveLength(1));
    expect(state.posts()[0]?.body).toEqual({
      code: 'TVA13',
      rate: '13',
      activeFrom: '2025-01-01',
      activeTo: null,
    });
    // The write remounts the list, so the rows are read again.
    await waitFor(() => expect(state.listCalls()).toBe(2));
  });

  it('retires the row with `{ isActive: false }` and refetches', async () => {
    const user = userEvent.setup();
    const state = stubFetch({ permissions: MANAGE });
    render(<TaxRatesList locale="en" />);

    await user.click(await screen.findByRole('button', { name: 'Retire' }));

    await waitFor(() => expect(state.patches()).toHaveLength(1));
    expect(state.patches()[0]).toEqual({
      url: '/api/settings/tax-rates/r-19',
      body: { isActive: false },
    });
    await waitFor(() => expect(state.listCalls()).toBe(2));
  });

  it('shows the refusal instead of clearing the form', async () => {
    const user = userEvent.setup();
    stubFetch({
      permissions: MANAGE,
      onPost: async () => ({
        ok: false,
        status: 409,
        json: async () => ({
          error: { code: 'CONFLICT', message: 'A Tax Rate with code "TVA19" already exists' },
        }),
      }),
    });
    render(<TaxRatesList locale="en" />);

    await screen.findByText('TVA19');

    await user.type(screen.getByLabelText('Code'), 'TVA19');
    await user.type(screen.getByLabelText('Tax rate'), '19');
    fireEvent.change(screen.getByLabelText('Effective from'), {
      target: { value: '2024-01-01' },
    });
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A Tax Rate with code "TVA19" already exists',
    );
  });

  it('hides the form and every Retire button without the permission', async () => {
    stubFetch({ permissions: [] });
    render(<TaxRatesList locale="en" />);

    await screen.findByText('TVA19');

    expect(screen.queryByRole('button', { name: 'Create' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retire' })).not.toBeInTheDocument();
  });
});
