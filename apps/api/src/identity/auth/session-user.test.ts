import { describe, expect, it } from 'vitest';
import { toSessionUser } from './session-user.js';

const activeUser = {
  id: 'user_1',
  email: 'clerk@easyerp.test',
  name: 'Warehouse Clerk',
  isActive: true,
};

const clerk = [{ roleId: 'role_clerk', permissions: ['item:read', 'stock:read'] }];

describe('toSessionUser', () => {
  it('maps an active account and the permissions its roles grant', () => {
    expect(toSessionUser(activeUser, clerk)).toEqual({
      id: 'user_1',
      email: 'clerk@easyerp.test',
      displayName: 'Warehouse Clerk',
      isActive: true,
      roleIds: ['role_clerk'],
      permissions: ['item:read', 'stock:read'],
    });
  });

  it('resolves nothing for an account that was switched off', () => {
    // The legacy defect: `isEnabled()` returned a hardcoded true, so the
    // editable `enabled` field had no effect whatsoever.
    expect(toSessionUser({ ...activeUser, isActive: false }, clerk)).toBeNull();
  });

  it('resolves nothing when the flag is missing, rather than assuming active', () => {
    expect(toSessionUser({ id: 'user_1', email: 'a@b.test', name: 'A' }, clerk)).toBeNull();
  });

  it('resolves nothing for a record with no identity', () => {
    expect(toSessionUser(null, clerk)).toBeNull();
    expect(toSessionUser({ email: 'a@b.test' }, clerk)).toBeNull();
  });

  it('resolves nothing when a role holds a permission outside the catalog', () => {
    const tampered = [{ roleId: 'role_clerk', permissions: ['item:read', 'root:sudo'] }];
    expect(toSessionUser(activeUser, tampered)).toBeNull();
  });

  it('resolves nothing for an email the contract would not accept', () => {
    expect(toSessionUser({ ...activeUser, email: 'not-an-email' }, clerk)).toBeNull();
  });

  it('unions the permissions of every role the user holds', () => {
    const two = [
      { roleId: 'role_clerk', permissions: ['item:read'] },
      { roleId: 'role_auditor', permissions: ['audit-trail:read'] },
    ];
    expect(toSessionUser(activeUser, two)?.permissions).toEqual(['item:read', 'audit-trail:read']);
    expect(toSessionUser(activeUser, two)?.roleIds).toEqual(['role_clerk', 'role_auditor']);
  });

  it('resolves an active user who holds no role yet, with no permissions', () => {
    const sessionUser = toSessionUser(activeUser, []);
    expect(sessionUser?.roleIds).toEqual([]);
    expect(sessionUser?.permissions).toEqual([]);
  });
});
