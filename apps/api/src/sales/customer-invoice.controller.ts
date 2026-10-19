/**
 * Customer Invoice routes.
 *
 * ## There is no DELETE route, and that is the point
 *
 * `permissions.ts` contains `customer-invoice:delete`, and a reader is right to
 * expect an endpoint. There is none, for a Draft or for an Issued document, and
 * the omission is deliberate: ADR 0006 gives an Issued document no delete path at
 * all, and the invariant is easier to keep when a Draft is cancelled by a
 * transition than when it is removed. Adding the route later would be a change of
 * decision, not a missing feature.
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

import { customerInvoiceSchema, type CustomerInvoice, type SessionUser } from '@easyerp/contracts';

import { CurrentUser, RequirePermissions } from '../identity/authorization.js';
import {
  DocumentListService,
  type DocumentPage,
} from '../documents/document-list.service.js';
import { CustomerInvoiceService } from './customer-invoice.service.js';
import { RequiresModule } from '../settings/modules.guard.js';
import { sendPrint } from '../common/print-response.js';

type Actor = { id: string; email: string };
const actorOf = (user: SessionUser): Actor => ({ id: user.id, email: user.email });
const ipOf = (request: Request): string | null => request.ip ?? null;

@Controller('sales/invoices')
@RequiresModule('FINANCE')
export class CustomerInvoiceController {
  constructor(
    private readonly invoices: CustomerInvoiceService,
    private readonly documents: DocumentListService,
  ) {}

  @RequirePermissions('customer-invoice:read')
  @Get()
  list(@Query() query: unknown): Promise<DocumentPage> {
    return this.documents.list('CUSTOMER_INVOICE', query);
  }

  @RequirePermissions('customer-invoice:create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async draft(
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
    @Req() request: Request,
  ): Promise<{ id: string; status: string }> {
    return this.invoices.createDraft(body, actorOf(user), ipOf(request));
  }

  /**
   * Issue a Draft. `201` rather than `200`: the request created a document that
   * did not exist before — a number, a fiscal artifact and a printable paper.
   */
  @RequirePermissions('customer-invoice:issue')
  @Post(':id/issue')
  @HttpCode(HttpStatus.CREATED)
  async issue(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Req() request: Request,
  ): Promise<CustomerInvoice> {
    return this.invoices.issue(id, actorOf(user), ipOf(request));
  }

  @RequirePermissions('customer-invoice:read')
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<CustomerInvoice> {
    const invoice = await this.invoices.findById(id);
    if (!invoice) throw new NotFoundException(`No Customer Invoice ${id}`);
    return invoice;
  }

  /**
   * The print copy: the paper rendered from the stored row and rasterised by the
   * visitor's own browser, so no host needs a browser to serve it.
   */
  @RequirePermissions('customer-invoice:read')
  @Get(':id/print')
  async print(@Param('id') id: string, @Res() response: Response): Promise<void> {
    sendPrint(response, id, await this.invoices.readPrint(id));
  }
}

export { customerInvoiceSchema };
