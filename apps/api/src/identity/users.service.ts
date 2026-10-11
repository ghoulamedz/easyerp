/**
 * Users and their roles.
 *
 * The rule this service exists to enforce: a Business can never be left without
 * an active administrator. Every mutation that could remove the last one checks
 * first, inside the same transaction, so two concurrent removals cannot both
 * pass the check and each believe it was the safe one.
 */

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { SessionUser, UserInput } from '@easyerp/contracts';
import { conflict, notFound } from '../common/errors.js';
import { Prisma } from '../generated/prisma/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ADMINISTRATOR_ROLE_CODE } from './roles.service.js';

export interface UserSummary {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly isActive: boolean;
  readonly roles: readonly { readonly id: string; readonly code: string; readonly name: string }[];
}

/**
 * Serialise the mutations that could empty the administrator set.
 *
 * A plain read of "who is an active administrator right now?" is not enough. Two
 * requests that each remove one of two administrators both read two, both judge
 * themselves safe, and both commit — leaving a Business nobody can administer.
 * A transaction-scoped advisory lock takes the same advisory lock in every such
 * transaction, so the second one waits, re-reads after the first has committed,
 * and then sees the truth.
 *
 * There is one deployment per Business, so a single fixed key is the right scope:
 * it serialises administrator changes and nothing else.
 */
async function lockAdministratorInvariant(tx: Prisma.TransactionClient): Promise<void> {
  // `$executeRaw`, not `$queryRaw`: pg_advisory_xact_lock returns `void`, and the
  // PostgreSQL driver adapter cannot deserialise a `void` column, so a `$queryRaw`
  // call fails with "Failed to deserialize column of type 'void'" before the lock
  // is ever taken. `$executeRaw` discards the row and still runs the statement,
  // which is exactly the semantics wanted from a lock.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('easyerp:identity:administrator')::bigint)`;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<UserSummary[]> {
    const users = await this.prisma.authUser.findMany({
      where: { deletedAt: null },
      orderBy: { email: 'asc' },
      include: { roles: { include: { role: { select: { id: true, code: true, name: true } } } } },
    });
    return users.map((user) => ({
      id: user.id,
      email: user.email,
      displayName: user.name,
      isActive: user.isActive,
      roles: user.roles.map((assignment) => assignment.role),
    }));
  }

  /**
   * Create a user with credential login. The hashing lives here because creating
   * an account IS hashing a password in this system — there is no other way to
   * become a user, and a password is never stored raw anywhere on the way in.
   */
  async create(input: UserInput): Promise<UserSummary> {
    const parsed = input;
    const existing = await this.prisma.authUser.findUnique({
      where: { email: parsed.email },
    });
    if (existing && !existing.deletedAt) throw conflict('A user with this email already exists');

    const roles = await this.prisma.role.findMany({ where: { id: { in: parsed.roleIds } } });
    const missing = parsed.roleIds.filter((id) => !roles.some((role) => role.id === id));
    if (missing.length > 0) throw notFound('Role', missing[0] ?? '');

    const { hashPassword } = await import('better-auth/crypto');
    const userId = randomUUID();

    const user = await this.prisma.$transaction(async (tx) => {
      await tx.authUser.create({
        data: {
          id: userId,
          email: parsed.email,
          name: parsed.displayName,
          emailVerified: true,
          isActive: parsed.isActive,
        },
      });
      await tx.authAccount.create({
        data: {
          id: randomUUID(),
          userId,
          providerId: 'credential',
          accountId: userId,
          password: await hashPassword(parsed.password),
        },
      });
      await tx.userRole.createMany({
        data: parsed.roleIds.map((roleId) => ({ userId, roleId })),
      });
      return await tx.authUser.findUniqueOrThrow({
        where: { id: userId },
        include: { roles: { include: { role: { select: { id: true, code: true, name: true } } } } },
      });
    });

    return {
      id: user.id,
      email: user.email,
      displayName: user.name,
      isActive: user.isActive,
      roles: user.roles.map((assignment) => assignment.role),
    };
  }

  async setRoles(userId: string, roleIds: readonly string[]): Promise<UserSummary> {
    if (roleIds.length === 0) {
      throw conflict('A user must keep at least one role');
    }

    return this.prisma.$transaction(async (tx) => {
      await lockAdministratorInvariant(tx);

      const user = await tx.authUser.findUniqueOrThrow({ where: { id: userId } });
      if (user.deletedAt) throw notFound('User', userId);

      const roles = await tx.role.findMany({ where: { id: { in: [...roleIds] } } });
      const missing = roleIds.filter((id) => !roles.some((role) => role.id === id));
      if (missing.length > 0) throw notFound('Role', missing[0] ?? '');

      await this.assertAnAdministratorRemains(
        tx,
        userId,
        roles.map((role) => role.code),
      );

      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userRole.createMany({ data: roleIds.map((roleId) => ({ userId, roleId })) });

      return {
        id: user.id,
        email: user.email,
        displayName: user.name,
        isActive: user.isActive,
        roles: roles.map((role) => ({ id: role.id, code: role.code, name: role.name })),
      };
    });
  }

  async setActive(userId: string, isActive: boolean, actor: SessionUser): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockAdministratorInvariant(tx);

      const user = await tx.authUser.findUnique({
        where: { id: userId },
        include: { roles: { include: { role: { select: { code: true } } } } },
      });
      if (!user || user.deletedAt) throw notFound('User', userId);

      if (
        !isActive &&
        user.roles.some((assignment) => assignment.role.code === ADMINISTRATOR_ROLE_CODE)
      ) {
        const heldBy = await this.activeAdministratorIds(tx);
        if (heldBy.length <= 1) {
          throw conflict('The last active administrator cannot be deactivated');
        }
      }

      if (actor.id === userId && !isActive) {
        throw conflict('You cannot deactivate your own account');
      }

      await tx.authUser.update({ where: { id: userId }, data: { isActive } });
    });
  }

  private async activeAdministratorIds(tx: Prisma.TransactionClient): Promise<string[]> {
    const holders = await tx.authUser.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        roles: { some: { role: { code: ADMINISTRATOR_ROLE_CODE } } },
      },
      select: { id: true },
    });
    return holders.map((holder) => holder.id);
  }

  /**
   * Refuse a role change that would leave the Business without an administrator.
   * Compared against the roles the user will hold *after* the change, not before.
   */
  private async assertAnAdministratorRemains(
    tx: Prisma.TransactionClient,
    userId: string,
    nextRoleCodes: readonly string[],
  ): Promise<void> {
    if (nextRoleCodes.includes(ADMINISTRATOR_ROLE_CODE)) return;

    const active = await tx.authUser.findUnique({
      where: { id: userId },
      select: { isActive: true, deletedAt: true },
    });
    if (!active?.isActive || active.deletedAt) return;

    const heldBy = await this.activeAdministratorIds(tx);
    if (heldBy.length <= 1) {
      throw conflict('The last administrator must keep the Administrator role');
    }
  }
}
