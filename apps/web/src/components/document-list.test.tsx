/**
 * @vitest-environment jsdom
 *
 * DocumentList issue/cancel actions: the buttons appear only when the page
 * wires the prop and the session carries the permission, Issue posts to the
 * issue route and refetches, and a refused transition surfaces the server
 * message instead of failing silently.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DocumentList } from './document-list';

const draftRow = {
  id: 'o-1',
  type: 'SALES_ORDER',
  status: 'DRAFT',
  number: null,
  partyId: 'p-1',
  partyName: 'Acme SARL',
  issuedAt: null,
  grossAmount: '100.000',
  currency: 'TND',
};

const listBody = { items: [draftRow], total: 1, page: 1, pageSize: 25 };

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
  listItems?: typeof listBody;
  onIssue?: () => Promise<unknown>;
}

function stubFetch({ permissions, listItems = listBody, onIssue }: StubOptions) {
  let listCalls = 0;
  const posts: string[] = [];
  global.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url === '/api/users/me') {
      return { ok: true, status: 200, json: async () => sessionUserWith(permissions) };
    }
    if (url === '/api/sales/orders' && method === 'GET') {
      listCalls += 1;
      return { ok: true, status: 200, json: async () => listItems };
    }
    if (url === '/api/sales/orders/o-1/issue' && method === 'POST') {
      posts.push(url);
      return (
        onIssue?.() ?? { ok: true, status: 201, json: async () => ({ id: 'o-1', status: 'ISSUED' }) }
      );
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  }) as unknown as typeof fetch;
  return {
    listCalls: () => listCalls,
    posts: () => posts,
  };
}

function renderSalesOrders() {
  return render(
    <DocumentList
      locale="en"
      endpoint="/sales/orders"
      createPermission="sales-order:create"
      newHref="/en/sales-orders/new"
      newKey="newSalesOrder"
      addFirstKey="addFirstSalesOrder"
      emptyKey="noSalesOrders"
      issuePermission="sales-order:issue"
      cancelPermission="sales-order:cancel"
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DocumentList actions', () => {
  it('posts to the issue route and refetches the list', async () => {
    const user = userEvent.setup();
    const state = stubFetch({
      permissions: ['sales-order:create', 'sales-order:issue', 'sales-order:cancel'],
    });
    renderSalesOrders();

    const issue = await screen.findByRole('button', { name: 'Issue' });
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();

    await user.click(issue);

    await waitFor(() => expect(state.listCalls()).toBe(2));
    expect(state.posts()).toEqual(['/api/sales/orders/o-1/issue']);
  });

  it('shows the server message when the transition is refused', async () => {
    const user = userEvent.setup();
    const state = stubFetch({
      permissions: ['sales-order:create', 'sales-order:issue', 'sales-order:cancel'],
      onIssue: async () => ({
        ok: false,
        status: 409,
        json: async () => ({
          error: { code: 'INVALID_TRANSITION', message: 'Only a Draft can be issued' },
        }),
      }),
    });
    renderSalesOrders();

    await user.click(await screen.findByRole('button', { name: 'Issue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Only a Draft can be issued');
    expect(state.listCalls()).toBe(1);
    expect(state.posts()).toEqual(['/api/sales/orders/o-1/issue']);
  });

  it('hides both actions when the session lacks the permissions', async () => {
    stubFetch({ permissions: ['sales-order:create'] });
    renderSalesOrders();

    await screen.findAllByText('Acme SARL');

    expect(screen.queryByRole('button', { name: 'Issue' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('keeps the empty state with its add-first affordance', async () => {
    stubFetch({
      permissions: ['sales-order:create', 'sales-order:issue', 'sales-order:cancel'],
      listItems: { items: [], total: 0, page: 1, pageSize: 25 },
    });
    renderSalesOrders();

    expect(await screen.findByText('No sales orders')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add the first order' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Issue' })).not.toBeInTheDocument();
  });
});
