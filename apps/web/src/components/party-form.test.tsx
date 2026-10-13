/**
 * @vitest-environment jsdom
 *
 * The new-Party form: roles toggle, the draft submits, a refusal stays on the
 * screen with its reason.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PartyForm } from './party-form';

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PartyForm', () => {
  it('creates the party with its roles and returns to the directory', async () => {
    const user = userEvent.setup();
    const seen: { url: string; body: unknown }[] = [];
    global.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      seen.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
      return { ok: true, status: 201, json: async () => ({ id: 'p-1' }) };
    }) as unknown as typeof fetch;

    render(<PartyForm locale="en" />);

    await user.type(screen.getByLabelText('Code'), 'ACME');
    await user.type(screen.getByLabelText('Name'), 'Acme SARL');
    await user.click(screen.getByRole('checkbox', { name: 'Supplier' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/en/parties'));
    const post = seen.find((s) => s.url === '/api/parties');
    expect(post?.body).toMatchObject({ code: 'ACME', roles: ['CUSTOMER', 'SUPPLIER'] });
  });

  it('keeps the draft and shows the refusal on conflict', async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 409,
      json: async () => ({ error: { code: 'CONFLICT', message: 'Duplicate Party code: ACME' } }),
    })) as unknown as typeof fetch;

    render(<PartyForm locale="en" />);

    await user.type(screen.getByLabelText('Code'), 'ACME');
    await user.type(screen.getByLabelText('Name'), 'Acme SARL');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Duplicate Party code: ACME');
    expect(push).not.toHaveBeenCalled();
  });
});
