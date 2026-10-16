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

const issuedRow = { ...draftRow, status: 'ISSUED', number: 'FT-2026-0001' };
const cancelledRow = { ...draftRow, status: 'CANCELLED', number: 'FT-2026-0001' };

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
  onCancel?: () => Promise<unknown>;
}

function stubFetch({ permissions, listItems = listBody, onIssue, onCancel }: StubOptions) {
  let listCalls = 0;
  const posts: string[] = [];
  global.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url === '/api/auth/get-session') {
      return { ok: true, status: 200, json: async () => ({ session: { userId: 'u-1' } }) };
    }
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
    if (url === '/api/sales/orders/o-1/cancel' && method === 'POST') {
      posts.push(url);
      return (
        onCancel?.() ?? { ok: true, status: 201, json: async () => ({ id: 'o-1', status: 'CANCELLED' }) }
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

  it('posts to the cancel route and refetches the list', async () => {
    const user = userEvent.setup();
    const state = stubFetch({
      permissions: ['sales-order:create', 'sales-order:issue', 'sales-order:cancel'],
    });
    renderSalesOrders();

    const cancel = await screen.findByRole('button', { name: 'Cancel' });
    expect(screen.getByRole('button', { name: 'Issue' })).toBeInTheDocument();

    await user.click(cancel);

    await waitFor(() => expect(state.listCalls()).toBe(2));
    expect(state.posts()).toEqual(['/api/sales/orders/o-1/cancel']);
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

  it('localizes a known error code via error-messages dictionary', async () => {
    const user = userEvent.setup();
    const state = stubFetch({
      permissions: ['sales-order:create', 'sales-order:issue', 'sales-order:cancel'],
      onCancel: async () => ({
        ok: false,
        status: 409,
        json: async () => ({
          error: { code: 'ILLEGAL_TRANSITION', message: 'Order o-1 is already cancelled' },
        }),
      }),
    });
    renderSalesOrders();

    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    // The error code ILLEGAL_TRANSITION should be localized to "This state change is not allowed."
    expect(await screen.findByRole('alert')).toHaveTextContent('This state change is not allowed.');
    expect(state.listCalls()).toBe(1);
    expect(state.posts()).toEqual(['/api/sales/orders/o-1/cancel']);
  });

  it('shows the generic conflict message for an already-issued order', async () => {
    const user = userEvent.setup();
    const state = stubFetch({
      permissions: ['sales-order:create', 'sales-order:issue', 'sales-order:cancel'],
      onIssue: async () => ({
        ok: false,
        status: 409,
        json: async () => ({
          error: {
            code: 'CONFLICT',
            message: 'Order o-1 is already issued as FT-2026-0001. Issued documents are immutable.',
          },
        }),
      }),
    });
    renderSalesOrders();

    await user.click(await screen.findByRole('button', { name: 'Issue' }));

    // A known code renders the dictionary generic: the server detail (ids,
    // numbers) never reaches the screen, so no document number is asserted.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The action conflicts with the current state.',
    );
    expect(state.listCalls()).toBe(1);
    expect(state.posts()).toEqual(['/api/sales/orders/o-1/issue']);
  });

  it('shows the generic conflict message for an already-issued invoice', async () => {
    const user = userEvent.setup();
    const invoiceRow = { ...draftRow, type: 'CUSTOMER_INVOICE', id: 'inv-1' };
    let listCalls = 0;
    const posts: string[] = [];
    global.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === '/api/auth/get-session') {
        return { ok: true, status: 200, json: async () => ({ session: { userId: 'u-1' } }) };
      }
      if (url === '/api/users/me') {
        return {
          ok: true,
          status: 200,
          json: async () =>
            sessionUserWith(['customer-invoice:create', 'customer-invoice:issue']),
        };
      }
      if (url === '/api/sales/invoices' && method === 'GET') {
        listCalls += 1;
        return { ok: true, status: 200, json: async () => ({ items: [invoiceRow], total: 1, page: 1, pageSize: 25 }) };
      }
      if (url === '/api/sales/invoices/inv-1/issue' && method === 'POST') {
        posts.push(url);
        return {
          ok: false,
          status: 409,
          json: async () => ({
            error: {
              code: 'CONFLICT',
              message: 'Invoice inv-1 is already issued as INV-2026-0001. Issued documents are immutable.',
            },
          }),
        };
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    }) as unknown as typeof fetch;
    render(
      <DocumentList
        locale="en"
        endpoint="/sales/invoices"
        createPermission="customer-invoice:create"
        newHref="/en/customer-invoices/new"
        newKey="newCustomerInvoice"
        addFirstKey="addFirstCustomerInvoice"
        emptyKey="noCustomerInvoices"
        issuePermission="customer-invoice:issue"
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Issue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The action conflicts with the current state.',
    );
    expect(listCalls).toBe(1);
    expect(posts).toEqual(['/api/sales/invoices/inv-1/issue']);
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

describe('DocumentList view/print', () => {
  function stubList(endpoint: string, items: Record<string, unknown>[]) {
    global.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === '/api/auth/get-session') {
        return { ok: true, status: 200, json: async () => ({ session: { userId: 'u-1' } }) };
      }
      if (url === '/api/users/me') {
        return {
          ok: true,
          status: 200,
          json: async () =>
            sessionUserWith(['sales-order:create', 'sales-order:issue', 'sales-order:cancel']),
        };
      }
      if (url === `/api${endpoint}` && method === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ items, total: items.length, page: 1, pageSize: 25 }),
        };
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    }) as unknown as typeof fetch;
  }

  function renderList(endpoint: string) {
    return render(
      <DocumentList
        locale="en"
        endpoint={endpoint}
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

  it('renders View and Print links with the pdf href for an issued invoice', async () => {
    stubList('/sales/invoices', [issuedRow]);
    renderList('/sales/invoices');

    const view = await screen.findByRole('link', { name: 'View' });
    expect(view).toHaveAttribute('href', '/api/sales/invoices/o-1/pdf');
    expect(view).toHaveAttribute('target', '_blank');
    const print = screen.getByRole('link', { name: 'Print' });
    expect(print).toHaveAttribute('href', '/api/sales/invoices/o-1/pdf');
    expect(print).toHaveAttribute('target', '_blank');
  });

  it('renders View and Print links for an issued credit note', async () => {
    stubList('/credit-notes', [issuedRow]);
    renderList('/credit-notes');

    const view = await screen.findByRole('link', { name: 'View' });
    expect(view).toHaveAttribute('href', '/api/credit-notes/o-1/pdf');
    expect(screen.getByRole('link', { name: 'Print' })).toHaveAttribute(
      'href',
      '/api/credit-notes/o-1/pdf',
    );
  });

  it('hides View and Print on endpoints with no pdf route', async () => {
    stubList('/sales/orders', [issuedRow]);
    renderList('/sales/orders');

    await screen.findAllByText('Acme SARL');

    expect(screen.queryByRole('link', { name: 'View' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Print' })).not.toBeInTheDocument();
  });

  it('hides View and Print for a draft with no archive', async () => {
    stubList('/sales/invoices', [draftRow]);
    renderList('/sales/invoices');

    await screen.findAllByText('Acme SARL');

    expect(screen.queryByRole('link', { name: 'View' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Print' })).not.toBeInTheDocument();
  });
});

describe('DocumentList filtering', () => {
  const filterableRows = [
    draftRow,
    { ...issuedRow, partyName: 'Globex SA' },
  ];

  function stubFilterableList() {
    const urls: string[] = [];
    global.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === '/api/auth/get-session') {
        return { ok: true, status: 200, json: async () => ({ session: { userId: 'u-1' } }) };
      }
      if (url === '/api/users/me') {
        return {
          ok: true,
          status: 200,
          json: async () =>
            sessionUserWith(['sales-order:create', 'sales-order:issue', 'sales-order:cancel']),
        };
      }
      if (url.startsWith('/api/sales/orders') && method === 'GET') {
        urls.push(url);
        const params = new URLSearchParams(url.includes('?') ? url.split('?')[1] : '');
        const status = params.get('status');
        const items = status
          ? filterableRows.filter((row) => row.status === status)
          : filterableRows;
        return {
          ok: true,
          status: 200,
          json: async () => ({ items, total: items.length, page: 1, pageSize: 25 }),
        };
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    }) as unknown as typeof fetch;
    return { urls: () => urls };
  }

  it('narrows rows through the status dropdown, passing status as a query param', async () => {
    const user = userEvent.setup();
    const state = stubFilterableList();
    renderSalesOrders();

    // Each row prints the party name twice (heading and counterparty cell).
    await screen.findAllByText('Acme SARL');
    expect(screen.getAllByText('Globex SA')).toHaveLength(2);

    await user.selectOptions(screen.getByLabelText('Filter by status'), 'ISSUED');

    await waitFor(() =>
      expect(state.urls().some((url) => url.includes('status=ISSUED'))).toBe(true),
    );
    expect(await screen.findAllByText('Globex SA')).toHaveLength(2);
    expect(screen.queryByText('Acme SARL')).not.toBeInTheDocument();
  });

  it('clear resets the status filter and restores every row', async () => {
    const user = userEvent.setup();
    const state = stubFilterableList();
    renderSalesOrders();

    await screen.findAllByText('Acme SARL');
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'ISSUED');
    await screen.findAllByText('Globex SA');
    expect(screen.queryByText('Acme SARL')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    await waitFor(() => {
      const last = state.urls()[state.urls().length - 1];
      expect(last).not.toContain('status=');
    });
    expect(await screen.findAllByText('Acme SARL')).toHaveLength(2);
    expect(screen.getAllByText('Globex SA')).toHaveLength(2);
  });

  it('shows no-results with a clear action when the filter matches nothing', async () => {
    const user = userEvent.setup();
    stubFilterableList();
    renderSalesOrders();

    await screen.findAllByText('Acme SARL');
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'CANCELLED');

    expect(await screen.findByText('No results')).toBeInTheDocument();
    // The bar keeps its own clear next to the dropdown, and the empty state
    // offers one beside the message — either resets the filter.
    expect(
      screen.getAllByRole('button', { name: 'Clear filters' }).length,
    ).toBeGreaterThanOrEqual(1);

    const clears = screen.getAllByRole('button', { name: 'Clear filters' });
    await user.click(clears[0] as HTMLElement);

    expect(await screen.findAllByText('Acme SARL')).toHaveLength(2);
    expect(screen.queryByText('No results')).not.toBeInTheDocument();
  });
});

describe('DocumentList button visibility by status', () => {
  function stubListWithPermissions(endpoint: string, items: Record<string, unknown>[]) {
    global.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === '/api/auth/get-session') {
        return { ok: true, status: 200, json: async () => ({ session: { userId: 'u-1' } }) };
      }
      if (url === '/api/users/me') {
        return {
          ok: true,
          status: 200,
          json: async () =>
            sessionUserWith(['sales-order:create', 'sales-order:issue', 'sales-order:cancel']),
        };
      }
      if (url === `/api${endpoint}` && method === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ items, total: items.length, page: 1, pageSize: 25 }),
        };
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    }) as unknown as typeof fetch;
  }

  function renderList(endpoint: string) {
    return render(
      <DocumentList
        locale="en"
        endpoint={endpoint}
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

  it('shows Issue and Cancel buttons for DRAFT rows', async () => {
    stubListWithPermissions('/sales/orders', [draftRow]);
    renderList('/sales/orders');

    await screen.findAllByText('Acme SARL');

    expect(screen.getByRole('button', { name: 'Issue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('hides Issue button for ISSUED rows, shows Cancel', async () => {
    stubListWithPermissions('/sales/orders', [issuedRow]);
    renderList('/sales/orders');

    await screen.findAllByText('Acme SARL');

    expect(screen.queryByRole('button', { name: 'Issue' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('hides Cancel button for CANCELLED rows, hides Issue', async () => {
    stubListWithPermissions('/sales/orders', [cancelledRow]);
    renderList('/sales/orders');

    await screen.findAllByText('Acme SARL');

    expect(screen.queryByRole('button', { name: 'Issue' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('hides Issue button for ISSUED invoice rows (no cancel permission on invoices)', async () => {
    stubListWithPermissions('/sales/invoices', [issuedRow]);
    // Invoices don't have cancel permission
    render(
      <DocumentList
        locale="en"
        endpoint="/sales/invoices"
        createPermission="sales-order:create"
        newHref="/en/sales-orders/new"
        newKey="newSalesOrder"
        addFirstKey="addFirstSalesOrder"
        emptyKey="noSalesOrders"
        issuePermission="sales-order:issue"
      />,
    );

    await screen.findAllByText('Acme SARL');

    expect(screen.queryByRole('button', { name: 'Issue' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    // View/Print should be visible for issued invoices
    expect(screen.getByRole('link', { name: 'View' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Print' })).toBeInTheDocument();
  });

  it('shows Issue for DRAFT invoice rows, hides View/Print', async () => {
    stubListWithPermissions('/sales/invoices', [draftRow]);
    render(
      <DocumentList
        locale="en"
        endpoint="/sales/invoices"
        createPermission="sales-order:create"
        newHref="/en/sales-orders/new"
        newKey="newSalesOrder"
        addFirstKey="addFirstSalesOrder"
        emptyKey="noSalesOrders"
        issuePermission="sales-order:issue"
      />,
    );

    await screen.findAllByText('Acme SARL');

    expect(screen.getByRole('button', { name: 'Issue' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'View' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Print' })).not.toBeInTheDocument();
  });
});