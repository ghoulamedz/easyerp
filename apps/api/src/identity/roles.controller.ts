/**
 * Roles routes (spec 001 stories 22–23).
 *
 * Roles are named bundles of catalog permissions; the Administrator role is
 * protected, which is why a route here 403s on it rather than silently editing
 * it. The wire validation is the read of the catalog — a permission that does
 * not exist is a typo, refused by name.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';

import { roleInputSchema, type RoleInput } from '@easyerp/contracts';

import { RequirePermissions } from './authorization.js';
import { RolesService } from './roles.service.js';

@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @RequirePermissions('role:read')
  @Get()
  list() {
    return this.roles.list();
  }

  @RequirePermissions('role:create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: RoleInput) {
    return this.roles.create(roleInputSchema.parse(body));
  }

  @RequirePermissions('role:update')
  @Put(':id/permissions')
  replacePermissions(@Param('id') id: string, @Body() body: { permissions: string[] }) {
    return this.roles.replacePermissions(id, body.permissions ?? []);
  }

  @RequirePermissions('role:update')
  @Put(':id/name')
  rename(@Param('id') id: string, @Body() body: { name: string }) {
    return this.roles.rename(id, body.name ?? '');
  }

  @RequirePermissions('role:delete')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    return this.roles.delete(id);
  }
}
