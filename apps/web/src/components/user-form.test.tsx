/**
 * @vitest-environment jsdom
 *
 * The new user form: roles load, creation posts and returns to the users list,
 * and Cancel returns without creating anything.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserForm } from './user-form';

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

const roles = {
  items: [
    {
      id: 'r-admin',
      code: 'ADMINISTRATOR',
      name: 'Administrator',
      permissions: [],
      isProtected: true,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 25,
};

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(async (url: unknown) => {
    const u = String(url);
    if (u === '/api/roles') return { ok: true, status: 200, json: async () => roles };
    if (u === '/api/users') return { ok: true, status: 201, json: async () => ({ id: 'u-1' }) };
    throw new Error(`unexpected ${u}`);
  }) as unknown as typeof fetch;
});

describe('UserForm', () => {
  it('cancel returns to the users list without creating anything', async () => {
    const user = userEvent.setup();
    const posts: string[] = [];
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      async (url: unknown, init?: RequestInit) => {
        if (init?.method === 'POST') {
          posts.push(String(url));
          return { ok: true, status: 201, json: async () => ({ id: 'u-1' }) };
        }
        if (String(url) === '/api/roles')
          return { ok: true, status: 200, json: async () => roles };
        throw new Error(`unexpected ${String(url)}`);
      },
    );
    render(<UserForm locale="en" />);
    const cancel = await screen.findByRole('button', { name: 'Cancel' });
    await user.click(cancel);
    expect(push).toHaveBeenCalledWith('/en/settings/users');
    expect(posts).toHaveLength(0);
  });
});
