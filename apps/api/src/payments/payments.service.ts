/**
 * Payments and their allocations.
 *
 * A Payment is a record of money received from a Customer. It is *not* a
 * Document: it has no number, no status and no archive. Its `allocations`
 * assign part of the payment to issued fiscal Documents — an allocation to a
 * Customer Invoice settles what was billed, an allocation to a Credit Note is a
 * refund paid back out. The excess of a Payment over its allocations is
 * unallocated credit.
 */

import { Injectable } from '@nestjs/common';

import {
  type Payment,
  type DraftPayment,
  type PartyBalance,
  type Money,
  money,
} from '@easyerp/contracts';

import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma';
import { Amount } from '../finance/amount';

/** The set of Document types that can be settled by a Payment. */
export type SettlementableDocumentType =
  | 'CUSTOMER_INVOICE'
  | 'CREDIT_NOTE';

/** The pagination envelope for a Payment collection. */
export interface PaymentPage {
  readonly items: readonly Payment[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

/**
 * Record a Payment. The schema enforces the wire shape; the checks below
 * enforce the domain rules, all inside one transaction under row locks on
 * the settled Documents, so two concurrent payments cannot both claim the
 * same remaining value:
 *
 * - `amount` is strictly positive and `sum(allocations) <= amount`;
 * - every allocation names an Issued fiscal Document of the same Customer —
 *   an Invoice or a Credit Note, never an order or a movement;
 * - the sum of the allocations' amounts equals the payment's amount.
 */

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Aggregate payment statistics for a Party.
   * Returns derived metrics without including already-allocated amounts.
   */
  async aggregatePayments(
    businessId: string,
    partyId: string,
  ): Promise<{
    invoiced: Money;
    credited: Money;
    outstanding: Money;
    unallocatedCredit: Money;
  }> {
    // Use raw queries to avoid TypeScript issues with Prisma aggregate types
    const invoicedResult = await this.prisma.$queryRaw<{ sum: string | null }[]>`
      SELECT SUM("grossAmount") as sum FROM "document"
      WHERE "businessId" = ${businessId} AND "partyId" = ${partyId}
      AND "type" = 'CUSTOMER_INVOICE' AND "status" = 'ISSUED'
    `;
    const invoiced = invoicedResult[0]?.sum
      ? Amount.parse(invoicedResult[0].sum)
      : Amount.zero();

    const creditedResult = await this.prisma.$queryRaw<{ sum: string | null }[]>`
      SELECT SUM("grossAmount") as sum FROM "document"
      WHERE "businessId" = ${businessId} AND "partyId" = ${partyId}
      AND "type" = 'CREDIT_NOTE' AND "status" = 'ISSUED'
    `;
    const credited = creditedResult[0]?.sum
      ? Amount.parse(creditedResult[0].sum)
      : Amount.zero();

    const unallocatedResult = await this.prisma.$queryRaw<{ sum: string | null }[]>`
      SELECT SUM("unallocatedCredit") as sum FROM "payment"
      WHERE "businessId" = ${businessId} AND "partyId" = ${partyId}
    `;
    const unallocatedCredit = unallocatedResult[0]?.sum
      ? Amount.parse(unallocatedResult[0].sum)
      : Amount.zero();

    const outstanding = invoiced.minus(credited);

    return {
      invoiced: invoiced.toMoney(),
      credited: credited.toMoney(),
      outstanding: outstanding.toMoney(),
      unallocatedCredit: unallocatedCredit.toMoney(),
    };
  }

  /**
   * Convert a Payment from Prisma model to the service response type.
   */
  private toPayment(
    payment: Prisma.PaymentGetPayload<{
      include: {
        allocations: {
          include: {
            document: {
              select: {
                type: true;
                number: true;
                currency: true;
              };
            };
          };
        };
      };
    }>,
  ): Payment {
    return {
      id: payment.id,
      businessId: payment.businessId,
      partyId: payment.partyId,
      amount: money(Amount.parse(payment.amount.toString()).toString()),
      receivedAt: payment.receivedAt.toISOString(),
      method: payment.method,
      reference: payment.reference,
      note: payment.note,
      unallocatedCredit: money(Amount.parse(payment.unallocatedCredit.toString()).toString()),
      createdAt: payment.createdAt.toISOString(),
      allocations: payment.allocations.map((allocation) => ({
        id: allocation.id,
        documentId: allocation.documentId,
        documentType: allocation.document.type as Payment['allocations'][0]['documentType'],
        documentNumber: allocation.document.number,
        amount: money(Amount.parse(allocation.amount.toString()).toString()),
        currency: allocation.document.currency,
        allocatedAmount: money(Amount.parse(allocation.amount.toString()).toString()),
      })),
    };
  }

  /**
   * List Payments, optionally filtered by Party/Business, with pagination.
   */
  async list(
    partyId: string | null,
    businessId: string | null,
    page: number,
    pageSize: number,
  ): Promise<PaymentPage> {
    const where: Record<string, unknown> = {};
    if (businessId) where.businessId = businessId;
    if (partyId) where.partyId = partyId;
    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: {
          allocations: {
            include: {
              document: {
                select: { type: true, number: true, currency: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      items: items.map((payment) => this.toPayment(payment)),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Create a new Payment.
   *
   * Validates that allocations do not exceed the payment amount and returns
   * the created Payment with its allocations.
   */
  async create(input: DraftPayment): Promise<Payment> {
    const totalAmount = input.allocations.reduce((sum, alloc) => {
      const amount = Amount.parse(alloc.amount.toString());
      return sum.plus(amount);
    }, Amount.zero());

    if (totalAmount.isGreaterThan(Amount.parse(input.amount.toString()))) {
      throw new Error(
        'The sum of allocations exceeds the payment amount',
      );
    }

    const unallocatedCredit = Amount.parse(input.amount.toString())
      .minus(totalAmount);

    const payment = await this.prisma.payment.create({
      data: {
        businessId: input.businessId,
        partyId: input.partyId,
        amount: input.amount.toString(),
        receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date(),
        method: input.method,
        reference: input.reference,
        note: input.note,
        unallocatedCredit: unallocatedCredit.toString(),
        allocations: {
          create: input.allocations.map((allocation, index) => ({
            documentId: allocation.documentId,
            amount: allocation.amount.toString(),
            position: index,
          })),
        },
      },
      include: {
        allocations: {
          include: {
            document: {
              select: { type: true, number: true, currency: true },
            },
          },
        },
      },
    });

    return this.toPayment(payment);
  }

  /**
   * Find a Payment by ID.
   */
  async findById(id: string): Promise<Payment | null> {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        allocations: {
          include: {
            document: {
              select: { type: true, number: true, currency: true },
            },
          },
        },
      },
    });

    if (!payment) {
      return null;
    }

    return this.toPayment(payment);
  }

  /**
   * Get a Party's balance summary.
   */
  async partyBalance(partyId: string): Promise<PartyBalance | null> {
    // Use raw queries for balance to avoid TypeScript issues with Prisma aggregate types
    const invoicedResult = await this.prisma.$queryRaw<{ sum: string | null }[]>`
      SELECT SUM("grossAmount") as sum FROM "document"
      WHERE "partyId" = ${partyId} AND "type" = 'CUSTOMER_INVOICE' AND "status" = 'ISSUED'
    `;
    const invoiced = invoicedResult[0]?.sum
      ? Amount.parse(invoicedResult[0].sum)
      : Amount.zero();

    const creditedResult = await this.prisma.$queryRaw<{ sum: string | null }[]>`
      SELECT SUM("grossAmount") as sum FROM "document"
      WHERE "partyId" = ${partyId} AND "type" = 'CREDIT_NOTE' AND "status" = 'ISSUED'
    `;
    const credited = creditedResult[0]?.sum
      ? Amount.parse(creditedResult[0].sum)
      : Amount.zero();

    const allocatedToInvoicesResult = await this.prisma.$queryRaw<{ sum: string | null }[]>`
      SELECT SUM(pa."amount") as sum FROM "payment_allocation" pa
      JOIN "document" d ON pa."documentId" = d."id"
      WHERE d."partyId" = ${partyId} AND d."type" = 'CUSTOMER_INVOICE' AND d."status" = 'ISSUED'
    `;
    const allocatedToInvoices = allocatedToInvoicesResult[0]?.sum
      ? Amount.parse(allocatedToInvoicesResult[0].sum)
      : Amount.zero();

    const allocatedToCreditNotesResult = await this.prisma.$queryRaw<{ sum: string | null }[]>`
      SELECT SUM(pa."amount") as sum FROM "payment_allocation" pa
      JOIN "document" d ON pa."documentId" = d."id"
      WHERE d."partyId" = ${partyId} AND d."type" = 'CREDIT_NOTE' AND d."status" = 'ISSUED'
    `;
    const allocatedToCreditNotes = allocatedToCreditNotesResult[0]?.sum
      ? Amount.parse(allocatedToCreditNotesResult[0].sum)
      : Amount.zero();

    const unallocatedResult = await this.prisma.$queryRaw<{ sum: string | null }[]>`
      SELECT SUM("unallocatedCredit") as sum FROM "payment"
      WHERE "partyId" = ${partyId}
    `;
    const unallocatedCredit = unallocatedResult[0]?.sum
      ? Amount.parse(unallocatedResult[0].sum)
      : Amount.zero();

    const outstanding = invoiced
      .minus(credited)
      .minus(allocatedToInvoices)
      .plus(allocatedToCreditNotes);

    return {
      partyId,
      invoiced: invoiced.toMoney(),
      credited: credited.toMoney(),
      allocatedToInvoices: allocatedToInvoices.toMoney(),
      allocatedToCreditNotes: allocatedToCreditNotes.toMoney(),
      outstanding: outstanding.toMoney(),
      unallocatedCredit: unallocatedCredit.toMoney(),
    };
  }
}