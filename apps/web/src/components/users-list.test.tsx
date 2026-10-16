/**
 * @vitest-environment jsdom
 *
 * Users list row actions. Every mutation goes through bare `fetch` (mocked
 * here), so these tests assert the method, path and body of each call — and
 * that a refused removal surfaces its message in an inline alert.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UsersList } from './users-list';

const adminRole = {
  id: 'r-admin',
  name: 'Administrator',
  code: 'ADMINISTRATOR',
  permissions: ['user:read', 'user:update'],
  isProtected: true,
};

const clerkRole = {
  id: 'r-clerk',
  name: 'Clerk',
  code: 'CLERK',
  permissions: ['item:read'],
  isProtected: false,
};

const ada = {
  id: 'u-ada',
  email: 'ada@example.test',
  displayName: 'Ada',
  isActive: true,
  roles: [adminRole],
};

const grace = {
  id: 'u-grace',
  email: 'grace@example.test',
  displayName: 'Grace',
  isActive: false,
  roles: [clerkRole],
};

interface Call {
  method: string;
  url: string;
  body: unknown;
}

function stubFetch(handlers: { onDelete?: (url: string) => { status: number; body: unknown } } = {}) {
  const calls: Call[] = [];
  let users = [ada, grace];
  global.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body === undefined ? undefined : JSON.parse(String(init.body));
    calls.push({ method, url, body });

    if (url === '/api/auth/get-session') {
      return { ok: true, status: 200, json: async () => ({ session: { userId: 'u-1' } }) };
    }
    if (url === '/api/users/me') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'u-ada',
          email: 'ada@example.test',
          displayName: 'Ada',
          isActive: true,
          roleIds: ['r-admin'],
          permissions: ['user:read', 'user:create', 'user:update'],
        }),
      };
    }
    if (url === '/api/users' && method === 'GET') {
      return { ok: true, status: 200, json: async () => users };
    }
    if (url === '/api/roles' && method === 'GET') {
      return { ok: true, status: 200, json: async () => [adminRole, clerkRole] };
    }
    if (url === `/api/users/${ada.id}/roles` && method === 'PATCH') {
      return { ok: true, status: 200, json: async () => ada };
    }
    if (url === `/api/users/${grace.id}/active` && method === 'PATCH') {
      users = users.map((u) => (u.id === grace.id ? { ...u, isActive: true } : u));
      return { ok: true, status: 200, json: async () => ({ id: grace.id }) };
    }
    if (method === 'DELETE' && url.startsWith('/api/users/')) {
      const verdict = handlers.onDelete?.(url) ?? { status: 204, body: undefined };
      return {
        ok: verdict.status >= 200 && verdict.status < 300,
        status: verdict.status,
        json: async () => verdict.body,
      };
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  }) as unknown as typeof fetch;
  return calls;
}

function patchCalls(calls: Call[], url: string): Call[] {
  return calls.filter((call) => call.url === url);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('UsersList row actions', () => {
  it('renders every user with their roles', async () => {
    stubFetch();
    render(<UsersList locale="en" />);

    expect(await screen.findByText('ada@example.test')).toBeInTheDocument();
    expect(screen.getByText('grace@example.test')).toBeInTheDocument();
    expect(screen.getByText('Administrator')).toBeInTheDocument();
    expect(screen.getByText('Clerk')).toBeInTheDocument();
  });

  it('edits roles through GET /roles and PATCH roles', async () => {
    const user = userEvent.setup();
    const calls = stubFetch();
    render(<UsersList locale="en" />);
    await screen.findByText('ada@example.test');

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]!);
    // Ada holds Administrator; adding Clerk sends both ids. The role-name
    // checkboxes exist only inside the editor, so the name is unambiguous.
    await user.click(await screen.findByRole('checkbox', { name: 'Clerk' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(patchCalls(calls, '/api/users/u-ada/roles')).toHaveLength(1);
    });
    expect(patchCalls(calls, '/api/users/u-ada/roles')[0]!.body).toEqual({
      roleIds: ['r-admin', 'r-clerk'],
    });
  });

  it('toggles Active through PATCH active with the flipped flag', async () => {
    const user = userEvent.setup();
    const calls = stubFetch();
    render(<UsersList locale="en" />);
    await screen.findByText('grace@example.test');

    await user.click(screen.getByRole('checkbox', { name: 'Active: grace@example.test' }));

    await waitFor(() => {
      expect(patchCalls(calls, '/api/users/u-grace/active')).toHaveLength(1);
    });
    expect(patchCalls(calls, '/api/users/u-grace/active')[0]!.body).toEqual({ isActive: true });
  });

  it('removes only on the second click, then deletes and refetches', async () => {
    const user = userEvent.setup();
    const calls = stubFetch();
    render(<UsersList locale="en" />);
    await screen.findByText('grace@example.test');

    // First click arms the confirm; nothing is sent yet. Grace is the second row.
    await user.click(screen.getAllByRole('button', { name: 'Remove' })[1]!);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(calls.filter((call) => call.method === 'DELETE')).toHaveLength(0);

    // Second click performs the soft delete and the list re-reads.
    const listCallsBefore = calls.filter((c) => c.url === '/api/users' && c.method === 'GET').length;
    await user.click(screen.getAllByRole('button', { name: 'Remove' })[1]!);
    await waitFor(() => {
      expect(calls.filter((call) => call.method === 'DELETE')).toHaveLength(1);
    });
    expect(calls.find((call) => call.method === 'DELETE')).toMatchObject({
      method: 'DELETE',
      url: '/api/users/u-grace',
    });
    await waitFor(() => {
      expect(
        calls.filter((c) => c.url === '/api/users' && c.method === 'GET').length,
      ).toBeGreaterThan(listCallsBefore);
    });
  });

  it('cancels the armed remove without calling the API', async () => {
    const user = userEvent.setup();
    const calls = stubFetch();
    render(<UsersList locale="en" />);
    await screen.findByText('grace@example.test');

    await user.click(screen.getAllByRole('button', { name: 'Remove' })[0]!);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(calls.filter((call) => call.method === 'DELETE')).toHaveLength(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a refused removal as an inline alert', async () => {
    const user = userEvent.setup();
    stubFetch({
      onDelete: () => ({
        status: 409,
        body: { error: { code: 'CONFLICT', message: 'The last active administrator cannot be removed' } },
      }),
    });
    render(<UsersList locale="en" />);
    await screen.findByText('ada@example.test');

    await user.click(screen.getAllByRole('button', { name: 'Remove' })[0]!);
    await user.click(screen.getAllByRole('button', { name: 'Remove' })[0]!);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The action conflicts with the current state.',
    );
  });

  it('shows a refused role save inside the editor', async () => {
    const user = userEvent.setup();
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
          json: async () => ({
            id: 'u-ada',
            email: 'ada@example.test',
            displayName: 'Ada',
            isActive: true,
            roleIds: ['r-admin'],
            permissions: ['user:read', 'user:create', 'user:update'],
          }),
        };
      }
      if (url === '/api/users' && method === 'GET') {
        // Ada holds both roles, so dropping Administrator still leaves one
        // selected and Save stays enabled for the refused PATCH.
        return {
          ok: true,
          status: 200,
          json: async () => [{ ...ada, roles: [adminRole, clerkRole] }],
        };
      }
      if (url === '/api/roles' && method === 'GET') {
        return { ok: true, status: 200, json: async () => [adminRole, clerkRole] };
      }
      if (url === '/api/users/u-ada/roles' && method === 'PATCH') {
        return {
          ok: false,
          status: 409,
          json: async () => ({
            error: { code: 'CONFLICT', message: 'The last administrator must keep the Administrator role' },
          }),
        };
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    }) as unknown as typeof fetch;
    render(<UsersList locale="en" />);
    await screen.findByText('ada@example.test');

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await screen.findByText('Clerk');
    // Drop Administrator, keep Clerk: the server refuses.
    await user.click(screen.getByRole('checkbox', { name: 'Administrator' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The action conflicts with the current state.',
    );
  });
});
