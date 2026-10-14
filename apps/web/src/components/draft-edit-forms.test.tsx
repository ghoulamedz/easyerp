/**
 * @vitest-environment jsdom
 *
 * Draft edit wiring: each edit form prefills from its GET read surface and
 * writes through the update route its controller actually serves. These tests
 * pin the wire shapes that broke before — strict update schemas reject stray
 * keys, and several settings/identity reads exist as list-only endpoints.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PurchaseOrderEditForm } from './purchase-order-edit-form';
import { ProductionOrderEditForm } from './production-order-edit-form';
import { UnitEditForm } from './unit-edit-form';
import { RoleEditForm } from './role-edit-form';
import { LabelEditForm } from './label-edit-form';
import { UserEditForm } from './user-edit-form';

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

type Seen = { url: string; method: string; body: unknown };

function mockFetch(routes: Record<string, unknown>, seen: Seen[]): void {
  global.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    if (init?.method && init.method !== 'GET') {
      seen.push({ url: u, method: init.method, body: JSON.parse(String(init.body)) });
      return { ok: true, status: 200, json: async () => ({}) };
    }
    for (const [prefix, payload] of Object.entries(routes)) {
      if (u === prefix || u.startsWith(`${prefix}?`) || u.startsWith(prefix)) {
        return { ok: true, status: 200, json: async () => payload };
      }
    }
    throw new Error(`unexpected GET ${u}`);
  }) as unknown as typeof fetch;
}

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
});

describe('PurchaseOrderEditForm', () => {
  it('prefills the draft and replaces the whole line set without a businessId', async () => {
    const seen: Seen[] = [];
    mockFetch(
      {
        '/api/parties': parties,
        '/api/items': items,
        '/api/purchasing/orders/o-1': {
          id: 'o-1',
          status: 'DRAFT',
          party: { id: 'p-1', code: 'SUP', name: 'Supplier SARL' },
          lines: [{ id: 'l-1', itemId: 'i-1', quantity: '2', description: null }],
        },
      },
      seen,
    );
    const user = userEvent.setup();
    render(<PurchaseOrderEditForm locale="en" id="o-1" />);

    expect(await screen.findByLabelText('Supplier')).toBeInTheDocument();
    expect(screen.getByLabelText('Quantity')).toHaveValue('2');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/en/purchasing/orders'));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({
      url: '/api/purchasing/orders/o-1',
      method: 'POST',
      body: { partyId: 'p-1', lines: [{ itemId: 'i-1', quantity: '2' }] },
    });
  });

  it('refuses an issued order without ever submitting', async () => {
    const seen: Seen[] = [];
    mockFetch(
      {
        '/api/parties': parties,
        '/api/items': items,
        '/api/purchasing/orders/o-9': { id: 'o-9', status: 'ISSUED', party: null, lines: [] },
      },
      seen,
    );
    render(<PurchaseOrderEditForm locale="en" id="o-9" />);

    expect(await screen.findByText('Only drafts can be edited.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(seen).toHaveLength(0);
  });
});

describe('ProductionOrderEditForm', () => {
  it('sends lines only: the drafted version is immutable', async () => {
    const seen: Seen[] = [];
    mockFetch(
      {
        '/api/items': items,
        '/api/production/orders/o-2': {
          id: 'o-2',
          status: 'DRAFT',
          lines: [{ id: 'l-1', itemId: 'i-1', quantity: '4', description: null }],
        },
      },
      seen,
    );
    const user = userEvent.setup();
    render(<ProductionOrderEditForm locale="en" id="o-2" />);

    expect(await screen.findByLabelText('Quantity')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/en/production/orders'));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({
      url: '/api/production/orders/o-2',
      method: 'POST',
      body: { lines: [{ itemId: 'i-1', quantity: '4' }] },
    });
  });
});

describe('UnitEditForm', () => {
  it('picks its row out of the list-only read surface', async () => {
    const seen: Seen[] = [];
    mockFetch(
      {
        '/api/settings/units': [
          { id: 'u-0', code: 'G', allowsFraction: false, isActive: true },
          { id: 'u-1', code: 'KG', allowsFraction: true, isActive: true },
        ],
      },
      seen,
    );
    const user = userEvent.setup();
    render(<UnitEditForm locale="en" id="u-1" />);

    expect(await screen.findByLabelText('Unit code')).toHaveValue('KG');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/en/settings/units'));
    expect(seen).toEqual([
      {
        url: '/api/settings/units/u-1',
        method: 'PATCH',
        body: { code: 'KG', allowsFraction: true, isActive: true },
      },
    ]);
  });
});

describe('RoleEditForm', () => {
  const roles = [
    { id: 'r-0', code: 'OTHER', name: 'Other', permissions: [], isProtected: false },
    {
      id: 'r-1',
      code: 'CLERK',
      name: 'Clerk',
      permissions: ['item:read'],
      isProtected: false,
    },
  ];

  it('renames and replaces permissions through the two PUT routes', async () => {
    const seen: Seen[] = [];
    mockFetch({ '/api/roles': roles }, seen);
    const user = userEvent.setup();
    render(<RoleEditForm locale="en" id="r-1" />);

    expect(await screen.findByLabelText('Role name')).toHaveValue('Clerk');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/en/settings/roles'));
    expect(seen).toEqual([
      { url: '/api/roles/r-1/name', method: 'PUT', body: { name: 'Clerk' } },
      {
        url: '/api/roles/r-1/permissions',
        method: 'PUT',
        body: { permissions: ['item:read'] },
      },
    ]);
  });

  it('never writes permissions for the protected Administrator role', async () => {
    const seen: Seen[] = [];
    mockFetch(
      {
        '/api/roles': [
          { id: 'r-9', code: 'ADMIN', name: 'Administrator', permissions: ['a:b'], isProtected: true },
        ],
      },
      seen,
    );
    const user = userEvent.setup();
    render(<RoleEditForm locale="en" id="r-9" />);

    expect(await screen.findByLabelText('Role name')).toHaveValue('Administrator');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/en/settings/roles'));
    expect(seen).toEqual([{ url: '/api/roles/r-9/name', method: 'PUT', body: { name: 'Administrator' } }]);
  });
});

describe('LabelEditForm', () => {
  it('matches its exact code and locale, and sends a string value', async () => {
    const seen: Seen[] = [];
    mockFetch(
      {
        '/api/settings/labels': [
          { entityType: 'DOCUMENT', entityCode: 'OTHER', locale: 'en', value: 'Wrong row' },
          { entityType: 'DOCUMENT', entityCode: 'SO', locale: 'en', value: 'Sales order' },
        ],
      },
      seen,
    );
    const user = userEvent.setup();
    render(<LabelEditForm locale="en" entityType="DOCUMENT" entityCode="SO" labelLocale="en" />);

    expect(await screen.findByLabelText('Value')).toHaveValue('Sales order');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/en/settings/labels'));
    expect(seen).toEqual([
      {
        url: '/api/settings/labels',
        method: 'PUT',
        body: { entityType: 'DOCUMENT', entityCode: 'SO', locale: 'en', value: 'Sales order' },
      },
    ]);
  });
});

describe('UserEditForm', () => {
  it('reads the user from the list and patches roles plus active status', async () => {
    const seen: Seen[] = [];
    mockFetch(
      {
        '/api/users': [
          {
            id: 'u-9',
            email: 'clerk@example.com',
            displayName: 'Clerk',
            isActive: true,
            roles: [{ id: 'r-1', code: 'CLERK', name: 'Clerk', permissions: [] }],
          },
        ],
        '/api/roles': [{ id: 'r-1', code: 'CLERK', name: 'Clerk', permissions: [] }],
      },
      seen,
    );
    const user = userEvent.setup();
    render(<UserEditForm locale="en" id="u-9" />);

    const email = await screen.findByLabelText('Email address');
    expect(email).toHaveValue('clerk@example.com');
    expect(email).toHaveAttribute('readonly');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/en/settings/users'));
    expect(seen).toEqual([
      { url: '/api/users/u-9/roles', method: 'PATCH', body: { roleIds: ['r-1'] } },
      { url: '/api/users/u-9/active', method: 'PATCH', body: { isActive: true } },
    ]);
  });
});
