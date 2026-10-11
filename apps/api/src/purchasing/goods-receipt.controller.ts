/**
 * Goods Receipt routes.
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
} from '@nestjs/common';
import type { Request } from 'express';

import {
  draftGoodsReceiptSchema,
  type GoodsReceipt,
  type SessionUser,
} from '@easyerp/contracts';

import { CurrentUser, RequirePermissions } from '../identity/authorization.js';
import {
  DocumentListService,
  type DocumentPage,
} from '../documents/document-list.service.js';
import { GoodsReceiptService } from './goods-receipt.service.js';
import { RequiresModule } from '../settings/modules.guard.js';

type Actor = { id: string; email: string };
const actorOf = (user: SessionUser): Actor => ({ id: user.id, email: user.email });
const ipOf = (request: Request): string | null => request.ip ?? null;

@Controller('purchasing/receipts')
@RequiresModule('PURCHASING')
export class GoodsReceiptController {
  constructor(
    private readonly receipts: GoodsReceiptService,
    private readonly documents: DocumentListService,
  ) {}

  @RequirePermissions('goods-receipt:read')
  @Get()
  list(@Query() query: unknown): Promise<DocumentPage> {
    return this.documents.list('GOODS_RECEIPT', query);
  }

  /**
   * Create and issue a Goods Receipt. A receipt is issued immediately.
   */
  @RequirePermissions('goods-receipt:create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
    @Req() request: Request,
  ): Promise<GoodsReceipt> {
    return this.receipts.createAndIssue(body, actorOf(user), ipOf(request));
  }

  @RequirePermissions('goods-receipt:read')
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<GoodsReceipt> {
    const receipt = await this.receipts.findById(id);
    if (!receipt) throw new NotFoundException(`No Goods Receipt ${id}`);
    return receipt;
  }
}

export { draftGoodsReceiptSchema };