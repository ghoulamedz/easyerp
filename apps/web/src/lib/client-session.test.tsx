/**
 * @vitest-environment jsdom
 *
 * How many times a screen asks who is signed in.
 *
 * This is the app's dominant page cost, and it was invisible: `fetchSession` costs two
 * round trips, every permission check reads it, and the calls multiply by the number of
 * *controls* rather than the number of screens. A five-row document list asked sixteen
 * times — thirty-three requests to render one list, each `/api/users/me` a database
 * round trip on Neon.
 *
 * The assertion is a ceiling, not an exact count: a screen may legitimately ask once, and
 * a change that made it ask twice would be a regression worth failing on.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { forgetSession } from './client-session';
import { useHasPermission } from './use-permissions';

const ROWS = 5;

const sessionUser = {
  id: 'u-1',
  email: 'owner@example.test',
  displayName: 'Owner',
  isActive: true,
  roleIds: ['r-admin'],
  permissions: ['sales-order:create', 'sales-order:issue', 'sales-order:cancel'],
};

/** Counts every request the screen makes, by path. */
function countRequests(): () => Map<string, number> {
  const seen = new Map<string, number>();
  global.fetch = vi.fn(async (input: unknown) => {
    const url = String(input);
    seen.set(url, (seen.get(url) ?? 0) + 1);
    if (url === '/api/auth/get-session') {
      return { ok: true, status: 200, json: async () => ({ session: { userId: 'u-1' } }) };
    }
    if (url === '/api/users/me') {
      return { ok: true, status: 200, json: async () => sessionUser };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        items: Array.from({ length: ROWS }, (_, index) => ({
          id: `o-${index}`,
          type: 'SALES_ORDER',
          status: 'DRAFT',
          number: null,
          partyId: 'p-1',
          partyName: `Party ${index}`,
          issuedAt: null,
          grossAmount: '100.000',
          currency: 'TND',
        })),
        total: ROWS,
        page: 1,
        pageSize: 25,
      }),
    };
  }) as unknown as typeof fetch;
  return () => seen;
}

/** One permission check per rendered control, which is what multiplied before. */
function Controls() {
  const canCreate = useHasPermission('sales-order:create');
  const canIssue = useHasPermission('sales-order:issue');
  const canCancel = useHasPermission('sales-order:cancel');
  return (
    <div>
      <span>{canCreate ? 'create' : 'no-create'}</span>
      <span>{canIssue ? 'issue' : 'no-issue'}</span>
      <span>{canCancel ? 'cancel' : 'no-cancel'}</span>
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Each test starts from "nobody has asked yet", like a fresh page load.
  forgetSession();
});

afterEach(() => {
  forgetSession();
});

describe('session fetching', () => {
  it('asks once however many controls read the answer', async () => {
    const counts = countRequests();

    // Thirty controls: what a ten-row list of action buttons amounts to.
    render(
      <div>
        {Array.from({ length: 10 }, (_, index) => (
          <Controls key={index} />
        ))}
      </div>,
    );

    expect(await screen.findAllByText('create')).toHaveLength(10);

    const seen = counts();
    expect(seen.get('/api/auth/get-session') ?? 0).toBeLessThanOrEqual(1);
    expect(seen.get('/api/users/me') ?? 0).toBeLessThanOrEqual(1);
    // Two round trips, not sixty.
    expect([...seen.values()].reduce((sum, n) => sum + n, 0)).toBeLessThanOrEqual(2);
  });

  it('reuses the answer for a later reader on the same page', async () => {
    const counts = countRequests();

    const { unmount } = render(<Controls />);
    await screen.findByText('create');
    unmount();
    render(<Controls />);
    await screen.findAllByText('create');

    expect(counts().get('/api/users/me') ?? 0).toBe(1);
  });

  it('asks again after a sign-in or a sign-out', async () => {
    // The two moments the answer changes. Without this the shell would keep answering
    // "signed out" after a sign-in and every gated control would stay hidden.
    const counts = countRequests();

    const first = render(<Controls />);
    await screen.findByText('create');
    first.unmount();

    forgetSession();
    render(<Controls />);
    await screen.findAllByText('create');

    expect(counts().get('/api/users/me') ?? 0).toBe(2);
  });
});
