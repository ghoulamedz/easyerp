/**
 * Purchase Order routes.
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  draftPurchaseOrderSchema,
  purchaseOrderUpdateSchema,
  type PurchaseOrder,
  type SessionUser,
} from '@easyerp/contracts';

import { CurrentUser, RequirePermissions } from '../identity/authorization.js';
import {
  DocumentListService,
  type DocumentPage,
} from '../documents/document-list.service.js';
import { sendPrint } from '../common/print-response.js';
import { PurchaseOrderService } from './purchase-order.service.js';
import { RequiresModule } from '../settings/modules.guard.js';

type Actor = { id: string; email: string };
const actorOf = (user: SessionUser): Actor => ({ id: user.id, email: user.email });
const ipOf = (request: Request): string | null => request.ip ?? null;

@Controller('purchasing/orders')
@RequiresModule('PURCHASING')
export class PurchaseOrderController {
  constructor(
    private readonly orders: PurchaseOrderService,
    private readonly documents: DocumentListService,
  ) {}

  @RequirePermissions('purchase-order:read')
  @Get()
  list(@Query() query: unknown): Promise<DocumentPage> {
    return this.documents.list('PURCHASE_ORDER', query);
  }

  @RequirePermissions('purchase-order:create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async draft(
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
    @Req() request: Request,
  ): Promise<{ id: string; status: string }> {
    return this.orders.createDraft(body, actorOf(user), ipOf(request));
  }

  @RequirePermissions('purchase-order:update')
  @Post(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
    @Req() request: Request,
  ): Promise<PurchaseOrder> {
    return this.orders.updateDraft(id, body, actorOf(user), ipOf(request));
  }

  /**
   * Issue a Draft Purchase Order.
   */
  @RequirePermissions('purchase-order:issue')
  @Post(':id/issue')
  @HttpCode(HttpStatus.CREATED)
  async issue(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Req() request: Request,
  ): Promise<PurchaseOrder> {
    return this.orders.issue(id, actorOf(user), ipOf(request));
  }

  /**
   * Cancel an Issued Purchase Order.
   */
  @RequirePermissions('purchase-order:cancel')
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Req() request: Request,
  ): Promise<PurchaseOrder> {
    return this.orders.cancel(id, actorOf(user), ipOf(request));
  }

  @RequirePermissions('purchase-order:read')
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<PurchaseOrder> {
    const order = await this.orders.findById(id);
    if (!order) throw new NotFoundException(`No Purchase Order ${id}`);
    return order;
  }


  /**
   * The print copy: the paper rendered from the stored row and rasterised by the
   * visitor's own browser, so no host needs a browser to serve it.
   */
  @RequirePermissions('purchase-order:read')
  @Get(':id/print')
  async print(@Param('id') id: string, @Res() response: Response): Promise<void> {
    sendPrint(response, id, await this.orders.readPrint(id));
  }
}

export { draftPurchaseOrderSchema, purchaseOrderUpdateSchema };