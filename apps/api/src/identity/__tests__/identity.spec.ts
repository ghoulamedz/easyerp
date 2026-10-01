/**
 * Identity invariants, against a real database.
 *
 * The theme: a Business must never be left without an active administrator, and
 * that must hold when two requests arrive at the same instant. The legacy system
 * had neither the check nor the lock.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { allPermissions } from '@easyerp/contracts';
import { DomainError } from '../../common/errors.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RolesService } from '../roles.service.js';
import { UsersService } from '../users.service.js';
import { actorFor, assignRole, createUser, prisma, resetDatabase } from './harness.js';

/** The services under test, wired exactly as the application wires them. */
const prismaService = new PrismaService();
const roles = new RolesService(prismaService);
const users = new UsersService(prismaService);

afterAll(async () => {
  await prismaService.$disconnect();
});

beforeEach(async () => {
  await resetDatabase();
  await roles.ensureAdministrator();
});

async function administratorRole() {
  const role = await prisma.role.findUnique({ where: { code: 'ADMINISTRATOR' } });
  expect(role).not.toBeNull();
  return role!;
}

async function clerkRole() {
  return roles.create({ code: 'CLERK', name: 'Clerk', permissions: ['item:read', 'stock:read'] });
}

describe('RolesService.ensureAdministrator', () => {
  it('creates the protected Administrator role holding every permission', async () => {
    const role = await administratorRole();
    expect(role.isProtected).toBe(true);
    expect([...role.permissions].sort()).toEqual([...allPermissions].sort());
  });

  it('is idempotent across repeated calls', async () => {
    await roles.ensureAdministrator();
    await roles.ensureAdministrator();
    expect(await prisma.role.count({ where: { code: 'ADMINISTRATOR' } })).toBe(1);
  });

  it('repairs a role that was emptied by hand', async () => {
    await prisma.role.update({
      where: { code: 'ADMINISTRATOR' },
      data: { permissions: [], isProtected: false },
    });

    await roles.ensureAdministrator();

    const repaired = await administratorRole();
    expect(repaired.isProtected).toBe(true);
    expect(repaired.permissions).toHaveLength(allPermissions.length);
  });

  it('leaves exactly one role when several processes boot at once', async () => {
    // Five replicas restarting together is the normal case, not an edge case.
    await Promise.all(Array.from({ length: 5 }, () => roles.ensureAdministrator()));
    expect(await prisma.role.count({ where: { code: 'ADMINISTRATOR' } })).toBe(1);
  });
});

describe('RolesService protections', () => {
  it('refuses to strip the Administrator role of permissions', async () => {
    const role = await administratorRole();
    await expect(roles.replacePermissions(role.id, [])).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    });
  });

  it('refuses to delete the Administrator role', async () => {
    const role = await administratorRole();
    await expect(roles.delete(role.id)).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
    expect(await prisma.role.count({ where: { code: 'ADMINISTRATOR' } })).toBe(1);
  });

  it('refuses a permission that is not in the catalog', async () => {
    await expect(
      roles.create({ code: 'X', name: 'X', permissions: ['root:sudo'] }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('allows a normal role to be edited and deleted', async () => {
    const clerk = await clerkRole();
    await expect(roles.replacePermissions(clerk.id, ['item:read'])).resolves.toEqual({
      permissions: ['item:read'],
    });
    await expect(roles.delete(clerk.id)).resolves.toBeUndefined();
  });
});

describe('the last administrator', () => {
  it('cannot have the Administrator role removed', async () => {
    const admin = await createUser({ name: 'Only Admin' });
    const adminRole = await administratorRole();
    const clerk = await clerkRole();
    await assignRole(admin.id, adminRole.id);

    await expect(users.setRoles(admin.id, [clerk.id])).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
    });
  });

  it('cannot be deactivated', async () => {
    const admin = await createUser({ name: 'Only Admin' });
    const adminRole = await administratorRole();
    await assignRole(admin.id, adminRole.id);
    const other = await createUser({ name: 'Someone Else' });

    await expect(users.setActive(admin.id, false, actorFor(other))).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
    });
    expect((await prisma.authUser.findUniqueOrThrow({ where: { id: admin.id } })).isActive).toBe(
      true,
    );
  });

  it('cannot deactivate its own account', async () => {
    const admin = await createUser({ name: 'Only Admin' });
    const adminRole = await administratorRole();
    await assignRole(admin.id, adminRole.id);

    await expect(users.setActive(admin.id, false, actorFor(admin))).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('may be changed once a second administrator exists', async () => {
    const first = await createUser({ name: 'First Admin' });
    const second = await createUser({ name: 'Second Admin' });
    const adminRole = await administratorRole();
    await assignRole(first.id, adminRole.id);
    await assignRole(second.id, adminRole.id);

    await expect(users.setActive(first.id, false, actorFor(second))).resolves.toBeUndefined();
  });

  it('survives two concurrent attempts to remove the last two administrators', async () => {
    // The bug this guards against: both transactions read "there are two active
    // administrators", both decide they are safe to proceed, and the Business is
    // left with nobody who can administer it.
    const first = await createUser({ name: 'First Admin' });
    const second = await createUser({ name: 'Second Admin' });
    const adminRole = await administratorRole();
    const clerk = await clerkRole();
    await assignRole(first.id, adminRole.id);
    await assignRole(second.id, adminRole.id);

    const attempts = await Promise.allSettled([
      users.setRoles(first.id, [clerk.id]),
      users.setRoles(second.id, [clerk.id]),
    ]);

    const fulfilled = attempts.filter((attempt) => attempt.status === 'fulfilled');
    const rejected = attempts.filter((attempt) => attempt.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(fulfilled).toHaveLength(1);

    const rejections = rejected.map((attempt) => attempt as PromiseRejectedResult);
    for (const rejection of rejections) {
      expect(rejection.reason).toBeInstanceOf(DomainError);
      expect((rejection.reason as DomainError).code).toBe('CONFLICT');
    }

    // Exactly one administrator must remain, and they must still hold the role.
    const remaining = await prisma.userRole.findMany({
      where: { userId: { in: [first.id, second.id] }, roleId: adminRole.id },
      select: { userId: true },
    });
    expect(remaining).toHaveLength(1);
  });

  it('survives two concurrent attempts to deactivate the last two administrators', async () => {
    const first = await createUser({ name: 'First Admin' });
    const second = await createUser({ name: 'Second Admin' });
    const adminRole = await administratorRole();
    await assignRole(first.id, adminRole.id);
    await assignRole(second.id, adminRole.id);
    const actor = actorFor(await createUser({ name: 'Operator' }));

    const attempts = await Promise.allSettled([
      users.setActive(first.id, false, actor),
      users.setActive(second.id, false, actor),
    ]);

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);

    const stillActive = await prisma.authUser.findMany({
      where: { id: { in: [first.id, second.id] }, isActive: true },
      select: { id: true },
    });
    expect(stillActive).toHaveLength(1);
  });
});

describe('UsersService', () => {
  it('refuses to leave a user with no role at all', async () => {
    const admin = await createUser();
    const adminRole = await administratorRole();
    await assignRole(admin.id, adminRole.id);

    await expect(users.setRoles(admin.id, [])).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('reports a role that does not exist', async () => {
    const admin = await createUser();
    await expect(
      users.setRoles(admin.id, ['00000000-0000-0000-0000-000000000000']),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
  });

  it('replaces a role set atomically', async () => {
    const admin = await createUser();
    const adminRole = await administratorRole();
    const clerk = await clerkRole();
    await assignRole(admin.id, adminRole.id);
    const otherAdmin = await createUser();
    await assignRole(otherAdmin.id, adminRole.id);

    const updated = await users.setRoles(admin.id, [adminRole.id, clerk.id]);

    expect(updated.roles.map((role) => role.code).sort()).toEqual(['ADMINISTRATOR', 'CLERK']);
    expect(await prisma.userRole.count({ where: { userId: admin.id } })).toBe(2);
  });

  it('hides a soft-deleted user from the list', async () => {
    const gone = await createUser();
    await prisma.authUser.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });

    expect((await users.list()).map((user) => user.id)).not.toContain(gone.id);
  });
});
