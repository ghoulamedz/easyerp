/**
 * Users routes (spec 001 stories 21–23).
 *
 * The Administrator manages people and the roles that hold permissions. Every
 * mutation that could remove the last active administrator is refused inside
 * `UsersService`; these routes are the thin surface over that invariant, and the
 * reason `user:create`/`user:update` exist as permissions is that the surface is
 * about people, not about permissions — those live on Roles.
 */

import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';

import { userInputSchema, type SessionUser, type UserInput } from '@easyerp/contracts';

import { CurrentUser, RequirePermissions } from './authorization.js';
import { UsersService, type UserSummary } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @RequirePermissions('user:read')
  @Get()
  list(): Promise<UserSummary[]> {
    return this.users.list();
  }

  @RequirePermissions('user:create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: UserInput): Promise<UserSummary> {
    return this.users.create(userInputSchema.parse(body));
  }

  @RequirePermissions('user:update')
  @Patch(':id/roles')
  setRoles(@Param('id') id: string, @Body() body: { roleIds: string[] }): Promise<UserSummary> {
    return this.users.setRoles(id, body.roleIds ?? []);
  }

  @RequirePermissions('user:update')
  @Patch(':id/active')
  setActive(
    @Param('id') id: string,
    @Body() body: { isActive: boolean },
    @CurrentUser() actor: SessionUser,
  ): Promise<{ id: string }> {
    return this.users.setActive(id, Boolean(body.isActive), actor).then(() => ({ id }));
  }
}
