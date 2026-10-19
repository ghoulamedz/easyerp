/**
 * Sales Order routes (spec 001 stories 33–45).
 *
 * Every mutation prices on the server and audits the change; nothing here trusts
 * a client with money, an amount, or the ledger. The routes exist to name the
 * operation — the rules live in the service and the contracts.
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { type SessionUser } from '@easyerp/contracts';

import { CurrentUser, RequirePermissions } from '../identity/authorization.js';
import { RequiresModule } from '../settings/modules.guard.js';
import {
  DocumentListService,
  type DocumentPage,
} from '../documents/document-list.service.js';
import { sendPrint } from '../common/print-response.js';
import { SalesOrderService } from './sales-order.service.js';
import { DeliveryNoteService } from './delivery-note.service.js';

type Actor = { id: string; email: string };
const actorOf = (user: SessionUser): Actor => ({ id: user.id, email: user.email });
const ipOf = (request: Request): string | null => request.ip ?? null;

@Controller('sales')
@RequiresModule('SALES')
export class SalesController {
  constructor(
    private readonly orders: SalesOrderService,
    private readonly deliveryNotes: DeliveryNoteService,
    private readonly documents: DocumentListService,
  ) {}

  @RequirePermissions('sales-order:create')
  @Post('orders')
  @HttpCode(HttpStatus.CREATED)
  draftOrder(@Body() body: unknown, @CurrentUser() user: SessionUser, @Req() request: Request) {
    return this.orders.createDraft(body, actorOf(user), ipOf(request));
  }

  @RequirePermissions('sales-order:read')
  @Get('orders')
  listOrders(@Query() query: unknown): Promise<DocumentPage> {
    return this.documents.list('SALES_ORDER', query);
  }

  @RequirePermissions('sales-order:read')
  @Get('orders/open')
  openOrders() {
    return this.orders.listOpenOrders();
  }

  @RequirePermissions('sales-order:read')
  @Get('orders/:id')
  async order(@Param('id') id: string) {
    return this.orders.findByRequiredId(id);
  }


  /**
   * The print copy: the paper rendered from the stored row and rasterised by the
   * visitor's own browser, so no host needs a browser to serve it.
   *
   * The `:id` is part of the path, not a detail: without it the handler reads
   * `undefined` and every request answers the paper of no document at all.
   */
  @RequirePermissions('sales-order:read')
  @Get('orders/:id/print')
  async orderPrint(@Param('id') id: string, @Res() response: Response): Promise<void> {
    sendPrint(response, id, await this.orders.readPrint(id));
  }

  @RequirePermissions('sales-order:update')
  @Patch('orders/:id')
  updateOrder(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
    @Req() request: Request,
  ) {
    return this.orders.update(id, body, actorOf(user), ipOf(request));
  }

  @RequirePermissions('sales-order:issue')
  @Post('orders/:id/issue')
  @HttpCode(HttpStatus.CREATED)
  issueOrder(@Param('id') id: string, @CurrentUser() user: SessionUser, @Req() request: Request) {
    return this.orders.issue(id, actorOf(user), ipOf(request));
  }

  @RequirePermissions('sales-order:cancel')
  @Post('orders/:id/cancel')
  cancelOrder(@Param('id') id: string, @CurrentUser() user: SessionUser, @Req() request: Request) {
    return this.orders.cancel(id, actorOf(user), ipOf(request));
  }

  @RequirePermissions('delivery-note:create')
  @Post('delivery-notes')
  @HttpCode(HttpStatus.CREATED)
  draftDeliveryNote(
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
    @Req() request: Request,
  ) {
    return this.deliveryNotes.createDraft(body, actorOf(user), ipOf(request));
  }

  @RequirePermissions('delivery-note:issue')
  @Post('delivery-notes/:id/issue')
  @HttpCode(HttpStatus.CREATED)
  issueDeliveryNote(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Req() request: Request,
  ) {
    return this.deliveryNotes.issue(id, actorOf(user), ipOf(request));
  }

  @RequirePermissions('delivery-note:read')
  @Get('delivery-notes')
  listDeliveryNotes(@Query() query: unknown): Promise<DocumentPage> {
    return this.documents.list('DELIVERY_NOTE', query);
  }

  @RequirePermissions('delivery-note:read')
  @Get('delivery-notes/:id')
  async deliveryNote(@Param('id') id: string) {
    return this.deliveryNotes.findByRequiredId(id);
  }


  /**
   * The print copy: the paper rendered from the stored row and rasterised by the
   * visitor's own browser, so no host needs a browser to serve it.
   *
   * The `:id` is part of the path, not a detail: without it the handler reads
   * `undefined` and every request answers the paper of no document at all.
   */
  @RequirePermissions('delivery-note:read')
  @Get('delivery-notes/:id/print')
  async deliveryNotePrint(@Param('id') id: string, @Res() response: Response): Promise<void> {
    sendPrint(response, id, await this.deliveryNotes.readPrint(id));
  }
}
