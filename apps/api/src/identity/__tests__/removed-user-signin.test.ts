/**
 * A removed user cannot sign in.
 *
 * The defect: `UsersService.remove()` soft-deleted the application row
 * (`deletedAt`) while the Better Auth identity — the credential row, live
 * sessions, and the `isActive` flag Better Auth actually reads — survived, so
 * the removed user kept signing in. The fix revokes all three in `remove()`,
 * refuses non-active users at session creation, and resolves no session for a
 * row that carries `deletedAt`.
 *
 * These run without a database: the session rule is pure, and `remove()` is
 * exercised against a stub transaction client that records the writes.
 */

import { describe, expect, it } from 'vitest';
import type { SessionUser } from '@easyerp/contracts';
import { mayObtainSession, toSessionUser } from '../auth/session-user.js';
import { UsersService } from '../users.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';

const clerk = [{ roleId: 'role_clerk', permissions: ['item:read', 'stock:read'] }];

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user_1',
    email: 'clerk@easyerp.test',
    name: 'Warehouse Clerk',
    isActive: true,
    deletedAt: null,
    ...overrides,
  };
}

describe('mayObtainSession', () => {
  it('admits an active user with no deletion marker', () => {
    expect(mayObtainSession(record())).toBe(true);
  });

  it('refuses a removed user even when the active flag was left on', () => {
    // The exact row `remove()` used to leave behind: soft-deleted but still
    // flagged active, which the old `isActive`-only check waved through.
    expect(mayObtainSession(record({ deletedAt: new Date() }))).toBe(false);
  });

  it('refuses a deactivated user', () => {
    expect(mayObtainSession(record({ isActive: false }))).toBe(false);
  });

  it('refuses a missing record or a missing flag rather than assuming active', () => {
    expect(mayObtainSession(null)).toBe(false);
    expect(mayObtainSession({ id: 'user_1' })).toBe(false);
  });
});

describe('toSessionUser', () => {
  it('resolves nothing for a removed user, so no request authenticates as them', () => {
    expect(toSessionUser(record({ deletedAt: new Date() }), clerk)).toBeNull();
  });

  it('still resolves an active user with no deletion marker', () => {
    expect(toSessionUser(record(), clerk)?.id).toBe('user_1');
  });
});

describe('UsersService.remove revokes the Better Auth identity', () => {
  /**
   * A transaction client that records the revocation writes instead of running
   * them. The removed user holds no role, so the last-administrator guard has
   * nothing to check and the test observes the revocation itself.
   */
  function stub() {
    const calls: { operation: string; args: unknown }[] = [];
    const tracked = (operation: string) => async (args: unknown) => {
      calls.push({ operation, args });
      return { count: 1 };
    };
    const fakeTx = {
      $executeRaw: async () => 0,
      authUser: {
        findUnique: async () => ({
          id: 'user_1',
          isActive: true,
          deletedAt: null,
          roles: [],
        }),
        update: tracked('authUser.update'),
      },
      authSession: { deleteMany: tracked('authSession.deleteMany') },
      authAccount: { deleteMany: tracked('authAccount.deleteMany') },
    };
    const fakePrisma = {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeTx),
    };
    return { calls, prisma: fakePrisma as unknown as PrismaService };
  }

  function actor(): SessionUser {
    return {
      id: 'actor_1',
      email: 'admin@easyerp.test',
      displayName: 'Administrator',
      isActive: true,
      roleIds: [],
      permissions: [],
    };
  }

  it('deactivates, timestamps, and deletes the credential and sessions', async () => {
    const { calls, prisma } = stub();
    await new UsersService(prisma).remove('user_1', actor());

    const update = calls.find((call) => call.operation === 'authUser.update');
    expect(update).toBeDefined();
    const data = (update?.args as { data: { isActive: boolean; deletedAt: Date } }).data;
    expect(data.isActive).toBe(false);
    expect(data.deletedAt).toBeInstanceOf(Date);

    expect(calls).toContainEqual({
      operation: 'authSession.deleteMany',
      args: { where: { userId: 'user_1' } },
    });
    expect(calls).toContainEqual({
      operation: 'authAccount.deleteMany',
      args: { where: { userId: 'user_1' } },
    });
  });

  it('leaves a row no session can be resolved from afterwards', async () => {
    const { prisma } = stub();
    await new UsersService(prisma).remove('user_1', actor());

    // The row as it now reads back: inactive and deletion-marked. Neither the
    // resolve path nor the sign-in guard admits it.
    const stored = record({ isActive: false, deletedAt: new Date() });
    expect(mayObtainSession(stored)).toBe(false);
    expect(toSessionUser(stored, clerk)).toBeNull();
  });
});
