/**
 * Party routes, gated by permissions only.
 *
 * No `@RequiresModule` — the same reasoning as the Item catalog: Sales and
 * Purchasing both address Parties, and a capability flips on and off without
 * scattering its master data. Parties (like Items) answer whenever the session
 * exists.
 *
 * There is no DELETE route. `party:delete` exists in the permission catalog and
 * is unused here: a Party is retired with `isActive: false`, never removed,
 * because documents name them.
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import type { Party, SessionUser } from '@easyerp/contracts';

import { CurrentUser, RequirePermissions } from '../identity/authorization.js';
import type { Paged } from '../catalog/item.service.js';
import { PartyService } from './party.service.js';

type Actor = { id: string; email: string };
const actorOf = (user: SessionUser): Actor => ({ id: user.id, email: user.email });
const ipOf = (request: Request): string | null => request.ip ?? null;

@Controller('parties')
export class PartyController {
  constructor(private readonly parties: PartyService) {}

  @RequirePermissions('party:create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
    @Req() request: Request,
  ): Promise<Party> {
    return this.parties.create(body, actorOf(user), ipOf(request));
  }

  @RequirePermissions('party:read')
  @Get()
  list(@Query() query: unknown): Promise<Paged<Party>> {
    return this.parties.list(query);
  }

  @RequirePermissions('party:read')
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Party> {
    const party = await this.parties.findById(id);
    if (!party) throw new NotFoundException(`No Party ${id}`);
    return party;
  }

  @RequirePermissions('party:update')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
    @Req() request: Request,
  ): Promise<Party> {
    return this.parties.update(id, body, actorOf(user), ipOf(request));
  }
}
