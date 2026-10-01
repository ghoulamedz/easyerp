/**
 * Roles are named bundles of catalog permissions. One rule governs every method
 * here: the Administrator role cannot be deleted and cannot be stripped of its
 * permissions. The legacy system allowed deactivating the last administrator with
 * no recovery path except a direct database edit.
 */

import { Injectable } from '@nestjs/common';
import { ADMINISTRATOR_ROLE, allPermissions, isPermission } from '@easyerp/contracts';
import { forbidden, notFound, validationFailed } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const ADMINISTRATOR_ROLE_CODE = 'ADMINISTRATOR';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Make sure the protected role exists and still holds every permission. Called
   * at boot, so an administrator that was emptied by hand or by a bad migration
   * repairs itself on the next restart.
   */
  async ensureAdministrator(): Promise<void> {
    await this.prisma.role.upsert({
      where: { code: ADMINISTRATOR_ROLE_CODE },
      update: { name: ADMINISTRATOR_ROLE, permissions: [...allPermissions], isProtected: true },
      create: {
        code: ADMINISTRATOR_ROLE_CODE,
        name: ADMINISTRATOR_ROLE,
        permissions: [...allPermissions],
        isProtected: true,
      },
    });
  }

  async list() {
    return this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { users: true } } },
    });
  }

  async create(input: { code: string; name: string; permissions: string[] }) {
    return this.prisma.role.create({
      data: { ...input, permissions: this.validate(input.permissions) },
    });
  }

  async replacePermissions(
    roleId: string,
    permissions: string[],
  ): Promise<{ permissions: string[] }> {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw notFound('Role', roleId);
    if (role.isProtected) {
      throw forbidden('The Administrator role always holds every permission');
    }
    return this.prisma.role.update({
      where: { id: roleId },
      data: { permissions: this.validate(permissions) },
      select: { permissions: true },
    });
  }

  async rename(roleId: string, name: string): Promise<{ id: string; name: string }> {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw notFound('Role', roleId);
    return this.prisma.role.update({
      where: { id: roleId },
      data: { name },
      select: { id: true, name: true },
    });
  }

  async delete(roleId: string): Promise<void> {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw notFound('Role', roleId);
    if (role.isProtected) throw forbidden('The Administrator role cannot be deleted');
    await this.prisma.role.delete({ where: { id: roleId } });
  }

  /** A permission outside the catalog is a typo, and a typo that silently grants nothing. */
  private validate(permissions: string[]): string[] {
    const unknown = permissions.filter((permission) => !isPermission(permission));
    if (unknown.length > 0) {
      throw validationFailed('Unknown permission', { unknown });
    }
    return [...new Set(permissions)];
  }
}
