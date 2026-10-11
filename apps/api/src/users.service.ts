/**
 * Users and their roles.
 *
 * The rule this service exists to enforce: a Business can never be left without
 * an active administrator. Every mutation that could remove the last one checks
 * first, inside the same transaction, so two concurrent removals cannot both
 * pass the check and each believe it was the safe one.
 */

import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { SessionUser, UserInput } from '@easyerp/contracts';
import { Prisma } from './generated/prisma/index';
import { PrismaService } from './prisma/prisma.service';
import { ADMINISTRATOR_ROLE_CODE } from './identity/roles.service';

export interface UserSummary {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly isActive: boolean;
  readonly roles: readonly { readonly id: string; readonly code: string; readonly name: string }[];
}

async function lockAdministratorInvariant(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRawUnsafe(
    "SELECT pg_advisory_xact_lock(hashtext('easyerp:identity:administrator'))::bigint",
  );
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<UserSummary[]> {
    const users = await this.prisma.authUser.findMany({
      where: { deletedAt: null },
      orderBy: { email: 'asc' },
      include: {
        roles: {
          include: {
            role: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });
    return users.map((user) => ({
      id: user.id,
      email: user.email,
      displayName: user.name,
      isActive: user.isActive,
      roles: (user.roles ?? []).map((assignment) => assignment.role),
    }));
  }

  async create(input: UserInput): Promise<UserSummary> {
    const parsed = input;
    const existing = await this.prisma.authUser.findUnique({
      where: { email: parsed.email },
    });
    if (existing && !existing.deletedAt) {
      throw new ConflictException('A user with this email already exists');
    }

    const roles = await this.prisma.role.findMany({
      where: { id: { in: parsed.roleIds } },
    });
    const missing = parsed.roleIds.filter(
      (id) => !roles.some((role) => role.id === id),
    );
    if (missing.length > 0) {
      throw new NotFoundException('Role', missing[0] ?? '');
    }

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
      const createdUser = await tx.authUser.findUnique({
        where: { id: userId },
        include: {
          roles: {
            include: {
              role: { select: { id: true, code: true, name: true } },
            },
          },
        },
      });
      if (!createdUser) {
        throw new NotFoundException('User', userId);
      }
      return createdUser;
    });

    return {
      id: user.id,
      email: user.email,
      displayName: user.name,
      isActive: user.isActive,
      roles: (user.roles ?? []).map((assignment) => assignment.role),
    };
  }

  async setRoles(userId: string, roleIds: readonly string[]): Promise<UserSummary> {
    if (roleIds.length === 0) {
      throw new ConflictException('A user must keep at least one role');
    }

    return this.prisma.$transaction(async (tx) => {
      await lockAdministratorInvariant(tx);

      const user = await tx.authUser.findUniqueOrThrow({
        where: { id: userId },
        include: { roles: { include: { role: true } } },
      });

      const roleIdsArray = [...roleIds];
      const roles = await tx.role.findMany({
        where: { id: { in: roleIdsArray } },
      });
      const missing = roleIds.filter(
        (id) => !roles.some((role) => role.id === id),
      );
      if (missing.length > 0) {
        throw new NotFoundException('Role', missing[0] ?? '');
      }

      await this.assertAnAdministratorRemains(
        tx,
        userId,
        roles.map((role) => role.code),
      );

      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userRole.createMany({
        data: roleIds.map((roleId) => ({ userId, roleId })),
      });

      return {
        id: user.id,
        email: user.email,
        displayName: user.name,
        isActive: user.isActive,
        roles: roles.map((role) => ({
          id: role.id,
          code: role.code,
          name: role.name,
        })),
      };
    });
  }

  async setActive(
    userId: string,
    isActive: boolean,
    actor: SessionUser,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockAdministratorInvariant(tx);

      const user = await tx.authUser.findUniqueOrThrow({
        where: { id: userId },
        include: { roles: { include: { role: true } } },
      });

      if (!user.isActive) {
        throw new NotFoundException('User', userId);
      }

      if (
        !isActive &&
        user.roles.some((assignment) =>
          assignment.role.code === ADMINISTRATOR_ROLE_CODE,
        )
      ) {
        const heldBy = await this.activeAdministratorIds(tx);
        if (heldBy.length <= 1) {
          throw new ConflictException(
            'The last active administrator cannot be deactivated',
          );
        }
      }

      if (actor.id === userId && !isActive) {
        throw new ConflictException('You cannot deactivate your own account');
      }

      await tx.authUser.update({
        where: { id: userId },
        data: { isActive },
      });
    });
  }

  private async activeAdministratorIds(
    tx: Prisma.TransactionClient,
  ): Promise<string[]> {
    const holders = await tx.authUser.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        roles: {
          some: {
            role: { code: ADMINISTRATOR_ROLE_CODE },
          },
        },
      },
      select: { id: true },
    });
    return holders.map((holder) => holder.id);
  }

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
      throw new ConflictException(
        'The last administrator must keep the Administrator role',
      );
    }
  }
}
