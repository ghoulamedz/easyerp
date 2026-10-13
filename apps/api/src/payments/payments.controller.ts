/**
 * Payment routes.
 *
 * A Payment is money received. It is *not* a Document: it has no number, no
 * status and no archive. Its `allocations` assign part of the payment to issued
 * fiscal Documents — an allocation to a Customer Invoice settles what was
 * billed, an allocation to a Credit Note is a refund paid back out. The excess
 * of a Payment over its allocations is unallocated credit.
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
} from '@nestjs/common';


import {
  draftPaymentSchema,
  partyBalanceSchema,
  type Payment,
  type PartyBalance,
} from '@easyerp/contracts';

import { RequirePermissions } from '../identity/authorization.js';
import { PaymentsService, type PaymentPage } from './payments.service.js';
import { RequiresModule } from '../settings/modules.guard.js';

import { pageQuerySchema } from '@easyerp/contracts';
import { z } from 'zod';

const paymentsListQuerySchema = pageQuerySchema.extend({
  partyId: z.string().min(1).optional(),
  businessId: z.string().min(1).optional(),
});

@Controller('payments')
@RequiresModule('FINANCE')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @RequirePermissions('payment:create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: unknown,
  ): Promise<Payment> {
    const parsed = draftPaymentSchema.parse(body);
    return this.payments.create(parsed);
  }

  @RequirePermissions('payment:read')
  @Get()
  list(@Query() query: unknown): Promise<PaymentPage> {
    const parsed = paymentsListQuerySchema.parse(query);
    const { partyId, businessId, page, pageSize } = parsed;
    return this.payments.list(partyId ?? null, businessId ?? null, page, pageSize);
  }

  @RequirePermissions('payment:read')
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Payment> {
    const payment = await this.payments.findById(id);
    if (!payment) throw new NotFoundException(`No Payment ${id}`);
    return payment;
  }

  @RequirePermissions('payment:read')
  @Get('party/:partyId/balance')
  async partyBalance(@Param('partyId') partyId: string): Promise<PartyBalance> {
    const balance = await this.payments.partyBalance(partyId);
    if (!balance) throw new NotFoundException(`No Party ${partyId}`);
    return balance;
  }
}

export { draftPaymentSchema, partyBalanceSchema };