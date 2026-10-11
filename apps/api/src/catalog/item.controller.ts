/**
 * Item routes, gated by permissions only.
 *
 * No `@RequiresModule` here — deliberately. The five Modules are capabilities the
 * Business switches on and off, and every one of them consumes Items: a Sales
 * Order, a Purchase Order, a Production Order and an invoice all price from the
 * same record. Items are the shared substrate those capabilities stand on, the
 * way Settings and Identity are, so they answer whenever the session exists.
 * Hiding them behind SALES would make a purchasing-only Business unable to
 * record what it buys.
 *
 * There is no DELETE route. `item:delete` exists in the catalog and is unused
 * here, for the same reason the Customer Invoice controller states: an Item is
 * retired, never removed, because documents that quote it did so already.
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

import type { Item, SessionUser } from '@easyerp/contracts';

import { CurrentUser, RequirePermissions } from '../identity/authorization.js';
import { ItemService, type Paged } from './item.service.js';

type Actor = { id: string; email: string };
const actorOf = (user: SessionUser): Actor => ({ id: user.id, email: user.email });
const ipOf = (request: Request): string | null => request.ip ?? null;

@Controller('items')
export class ItemController {
  constructor(private readonly items: ItemService) {}

  @RequirePermissions('item:create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
    @Req() request: Request,
  ): Promise<Item> {
    return this.items.create(body, actorOf(user), ipOf(request));
  }

  @RequirePermissions('item:read')
  @Get()
  list(@Query() query: unknown): Promise<Paged<Item>> {
    return this.items.list(query);
  }

  @RequirePermissions('item:read')
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Item> {
    const item = await this.items.findById(id);
    if (!item) throw new NotFoundException(`No Item ${id}`);
    return item;
  }

  @RequirePermissions('item:update')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
    @Req() request: Request,
  ): Promise<Item> {
    return this.items.update(id, body, actorOf(user), ipOf(request));
  }
}
