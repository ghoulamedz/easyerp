/**
 * @vitest-environment jsdom
 *
 * StockList adjust dialog: the Adjust button confirms the password by
 * re-signing-in as the session user, then posts the adjustment and refetches;
 * a wrong password (401) shows the sign-in error and never posts stock.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StockList } from './stock-list';

const rows = [
  {
    itemId: 'i-1',
    code: 'WIDGET',
    name: 'Widget',
    onHand: '0.000',
    reserved: '0.000',
    available: '0.000',
    reorderPoint: null,
    atOrBelowReorder: false,
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
  signInStatus: number;
  onAdjust?: (body: unknown) => void;
}

function stubFetch({ signInStatus, onAdjust }: StubOptions) {
  let listCalls = 0;
  const signInBodies: unknown[] = [];
  const adjustBodies: unknown[] = [];
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
        json: async () => sessionUserWith(['stock:adjust']),
      };
    }
    if (url === '/api/inventory/stock' && method === 'GET') {
      listCalls += 1;
      return { ok: true, status: 200, json: async () => rows };
    }
    if (url === '/api/auth/sign-in/email' && method === 'POST') {
      signInBodies.push(JSON.parse(String(init?.body)));
      return {
        ok: signInStatus === 200,
        status: signInStatus,
        json: async () => (signInStatus === 200 ? { ok: true } : {}),
      };
    }
    if (url === '/api/inventory/stock/adjust' && method === 'POST') {
      const body = JSON.parse(String(init?.body));
      adjustBodies.push(body);
      onAdjust?.(body);
      return { ok: true, status: 201, json: async () => ({}) };
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  }) as unknown as typeof fetch;
  return {
    listCalls: () => listCalls,
    signInBodies: () => signInBodies,
    adjustBodies: () => adjustBodies,
  };
}

async function openAdjustDialog(user: ReturnType<typeof userEvent.setup>) {
  render(<StockList locale="en" />);
  await user.click(await screen.findByRole('button', { name: 'Adjust' }));
  await screen.findByLabelText('Confirm with your password');
  await user.type(screen.getByLabelText('Quantity'), '5');
  await user.selectOptions(screen.getByRole('combobox'), 'ADJUSTMENT_OUT');
  await user.type(screen.getByLabelText('Reason'), 'count correction');
  await user.type(screen.getByLabelText('Confirm with your password'), 's3cret');
  await user.click(screen.getByRole('button', { name: 'Create' }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('StockList adjust dialog', () => {
  it('posts the adjustment after the password is confirmed and refetches', async () => {
    const user = userEvent.setup();
    const state = stubFetch({ signInStatus: 200 });

    await openAdjustDialog(user);

    await waitFor(() => expect(state.listCalls()).toBe(2));
    expect(state.signInBodies()).toEqual([
      { email: 'owner@example.test', password: 's3cret' },
    ]);
    expect(state.adjustBodies()).toEqual([
      {
        itemId: 'i-1',
        reason: 'ADJUSTMENT_OUT',
        quantity: '5',
        reasonText: 'count correction',
      },
    ]);
  });

  it('shows the sign-in error on a wrong password and never posts stock', async () => {
    const user = userEvent.setup();
    const state = stubFetch({ signInStatus: 401 });

    await openAdjustDialog(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Those credentials were refused.',
    );
    expect(state.adjustBodies()).toEqual([]);
    expect(state.listCalls()).toBe(1);
  });
});
