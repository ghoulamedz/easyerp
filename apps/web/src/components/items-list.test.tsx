/**
 * @vitest-environment jsdom
 *
 * The Item list's Edit link: it points at the edit screen that exists, and it
 * appears only for a session that may update an Item. The route
 * (`/items/<id>/edit`) was reachable by typing a URL and linked from nowhere,
 * which is one step from a screen nobody can use.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ItemsList } from './items-list';

// The list reads its first filter values from the URL, so the hook needs a value.
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const items = {
  items: [
    {
      id: 'i-1',
      code: 'WIDGET',
      name: 'Widget',
      description: 'A widget',
      itemType: 'FINISHED_GOOD',
      baseUnitId: 'u-1',
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
    },
  ],
  total: 1,
  page: 1,
  pageSize: 25,
};

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

function stub(permissions: string[]) {
  global.fetch = vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url === '/api/auth/get-session') {
      return { ok: true, status: 200, json: async () => ({ session: { userId: 'u-1' } }) };
    }
    if (url === '/api/users/me') {
      return { ok: true, status: 200, json: async () => sessionUserWith(permissions) };
    }
    if (url.startsWith('/api/items')) {
      return { ok: true, status: 200, json: async () => items };
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ItemsList', () => {
  it('links Edit at the Item edit screen', async () => {
    stub(['item:read', 'item:create', 'item:update']);
    render(<ItemsList locale="en" />);

    const edit = await screen.findByRole('link', { name: 'Edit' });

    expect(edit).toHaveAttribute('href', '/en/items/i-1/edit');
  });

  it('offers no Edit link to a session that may not update an Item', async () => {
    // The API refuses the PATCH regardless; a link would only be a button whose
    // only outcome is a 403.
    stub(['item:read']);
    render(<ItemsList locale="en" />);

    expect(await screen.findByText('Widget')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
  });
});
