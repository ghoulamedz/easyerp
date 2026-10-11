/**
 * The Sales Order (spec 001 stories 33–45, ADR 0004, ADR 0014).
 *
 * An order is a promise, priced exactly like an invoice (same `price-document.ts`),
 * stored in the generic `document` table under `type: SALES_ORDER`.
 *
 * ## Issuing is where stock enters the picture
 *
 * A Draft order promises nothing against stock. Issuing allocates a number,
 * re-prices from the Items (ADR 0005), and **for every goods line creates a
 * Reservation** — a quantity the Item's Available no longer counts. The check
 * happens inside the issuing transaction, under row locks on the Item rows and
 * on the ledger and reservation rows:
 *
 * - `STRICT` refuses an issue whose line exceeds what is Available (409,
 *   `INSUFFICIENT_STOCK`). This is the legacy overselling bug, refused.
 * - `ALLOW` accepts the shortfall: it becomes a backorder, visible as a negative
 *   Available until the stock arrives (CONTEXT.md, `backorderPolicy`).
 *
 * A Service line is never reserved: services do not draw on a stock ledger.
 *
 * ## After issuing
 *
 * The order is immutable (ADR 0006, database trigger). Delivery Notes then
 * fulfil it by growing `deliveredQuantity` on its Reservations; a note for the
 * full remaining amount sets `releasedAt`. Cancellation releases every open
 * Reservation in the same transaction as the status change, so the stock becomes
 * sellable the moment the promise ends.
 */

import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';

import {
  canTransition,
  documentStatusSchema,
  draftSalesOrderSchema,
  quantity,
  salesOrderSchema,
  salesOrderUpdateSchema,
  type SalesOrder,
} from '@easyerp/contracts';

import { AuditService, type AuditActor } from '../audit/audit.service.js';
import { conflict, DomainError, invariant, notFound, validationFailed } from '../common/errors.js';
import { Prisma } from '../generated/prisma/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StockLedgerService } from '../inventory/stock-ledger.service.js';
import { DocumentNumberingService } from '../numbering/document-numbering.service.js';
import { priceItems, repriceTotals, type DocumentPricedLine } from './price-document.js';

export const SALES_ORDER = 'SALES_ORDER';

type DocumentWithReservation = Prisma.DocumentGetPayload<{
  include: {
    lines: true;
    party: true;
    reservations: true;
  };
}>;

@Injectable()
export class SalesOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: DocumentNumberingService,
    private readonly stock: StockLedgerService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Draft an order. Like a Draft invoice it is priced for review, but it promises
   * nothing: no number (ADR 0006) and no Reservation.
   */
  async createDraft(
    payload: unknown,
    actor: AuditActor = {},
    ipAddress?: string | null,
  ): Promise<{ id: string; status: string }> {
    const input = draftSalesOrderSchema.parse(payload);

    const [business, party] = await Promise.all([
      this.prisma.business.findUnique({ where: { id: input.businessId } }),
      this.prisma.party.findFirst({
        where: { id: input.partyId, isActive: true, roles: { has: 'CUSTOMER' } },
      }),
    ]);

    if (!business) throw notFound('Business', input.businessId);
    if (!party) {
      throw validationFailed(
        `No active Party ${input.partyId} holding the CUSTOMER role. An order is a promise to ` +
          'a Customer, and Parties are deactivated rather than deleted.',
        { partyId: input.partyId },
      );
    }

    const priced = await priceItems(this.prisma, input.lines);
    const totals = orderTotals(priced);

    const created = await this.prisma.document.create({
      data: {
        type: SALES_ORDER,
        status: 'DRAFT',
        businessId: business.id,
        partyId: party.id,
        locale: localeFor(business.countryCode),
        vatRegime: business.vatRegime,
        currency: business.currency,
        netAmount: totals.netAmount,
        taxAmount: totals.taxAmount,
        grossAmount: totals.grossAmount,
        lines: {
          create: priced.map((line, position) => orderLineRow(line, position)),
        },
        taxes: {
          create: totals.taxGroups.map((group, position) => ({
            position,
            rate: group.rate,
            base: group.base,
            amount: group.amount,
          })),
        },
      },
      select: { id: true, status: true },
    });

    await this.audit.record(
      this.prisma,
      {
        action: 'sales-order.drafted',
        entityType: SALES_ORDER,
        entityId: created.id,
        after: { status: created.status, grossAmount: totals.grossAmount },
      },
      { ...actor, ipAddress: ipAddress ?? null },
    );

    return { id: created.id, status: created.status };
  }

  /**
   * Edit a Draft order: change the Customer or replace the whole line set. The
   * lines are replaced, not merged — an order a client opens twice must show what
   * it last saved. Issued and cancelled orders refuse the edit: the first is
   * immutable, the second is signed history.
   */
  async update(
    id: string,
    payload: unknown,
    actor: AuditActor = {},
    ipAddress?: string | null,
  ): Promise<SalesOrder> {
    const input = salesOrderUpdateSchema.parse(payload);

    const order = await this.prisma.document.findFirst({
      where: { id, type: SALES_ORDER },
    });
    if (!order) throw notFound('Sales Order', id);
    if (order.status !== 'DRAFT') {
      throw conflict(
        `Only a Draft order can be edited; ${id} is ${order.status}. An issued order is immutable ` +
          'and a cancelled one is signed history.',
        { id, status: order.status },
      );
    }

    let partyId = order.partyId;
    if (input.partyId) {
      const party = await this.prisma.party.findFirst({
        where: { id: input.partyId, isActive: true, roles: { has: 'CUSTOMER' } },
      });
      if (!party) {
        throw validationFailed(`No active Party ${input.partyId} holding the CUSTOMER role.`, {
          partyId: input.partyId,
        });
      }
      partyId = party.id;
    }

    if (!input.lines) {
      await this.prisma.document.update({ where: { id }, data: { partyId } });
    } else {
      const priced = await priceItems(this.prisma, input.lines);
      const totals = orderTotals(priced);

      await this.prisma.$transaction(async (tx) => {
        await tx.documentLine.deleteMany({ where: { documentId: order.id } });
        await tx.documentTaxGroup.deleteMany({ where: { documentId: order.id } });
        await tx.document.update({
          where: { id: order.id },
          data: {
            partyId,
            netAmount: totals.netAmount,
            taxAmount: totals.taxAmount,
            grossAmount: totals.grossAmount,
          },
        });
        await tx.documentLine.createMany({
          data: priced.map((line, position) => ({
            documentId: order.id,
            ...orderLineRow(line, position),
          })),
        });
        await tx.documentTaxGroup.createMany({
          data: totals.taxGroups.map((group, position) => ({
            documentId: order.id,
            position,
            rate: group.rate,
            base: group.base,
            amount: group.amount,
          })),
        });
      });
    }

    await this.audit.record(
      this.prisma,
      {
        action: 'sales-order.updated',
        entityType: SALES_ORDER,
        entityId: id,
        before: { partyId: order.partyId },
        after: { partyId },
      },
      { ...actor, ipAddress: ipAddress ?? null },
    );

    const found = await this.findById(id);
    if (!found) throw notFound('Sales Order', id);
    return found;
  }

  /**
   * Issue a Draft order.
   *
   * One transaction: Item rows are locked `FOR UPDATE` (so two concurrent issues
   * cannot both read the same Available), the shortfall is checked against
   * `backorderPolicy`, the number is allocated, the Reservations are created, and
   * the order becomes Issued. Every figure the order shows is re-priced here, so
   * an order issued today never prices at yesterday's Item price.
   */
  async issue(id: string, actor: AuditActor = {}, ipAddress?: string | null): Promise<SalesOrder> {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.document.findFirst({
        where: { id, type: SALES_ORDER },
        include: { lines: { orderBy: { position: 'asc' } }, business: true },
      });

      if (!order) throw notFound('Sales Order', id);
      if (order.status === 'ISSUED') {
        throw conflict(
          `Order ${id} is already issued as ${order.number}. Issued documents are immutable; ` +
            'fulfil it with Delivery Notes or release it with cancellation.',
          { id, number: order.number },
        );
      }
      if (order.status === 'CANCELLED') {
        throw conflict(`Order ${id} is cancelled and has no future.`, { id });
      }
      if (order.lines.length === 0) {
        throw validationFailed('A Draft order with no lines cannot be issued.', { id });
      }

      const itemIds = [...new Set(order.lines.map((line) => line.itemId))].sort();
      if (itemIds.length > 0) {
        // Serialise concurrent issues over the same Items: the availability read
        // below is only authoritative for the duration of this lock.
        await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM item WHERE "id" IN (${Prisma.join(itemIds)}) FOR UPDATE
        `;
      }

      const priced = await priceItems(
        tx,
        order.lines.map(({ itemId, quantity: q }) => ({
          itemId,
          quantity: quantity(q.toString()),
        })),
      );

      const goods = priced.filter((line) => line.itemType !== 'SERVICE');
      if (goods.length > 0) {
        // The check is the policy. STRICT refuses to promise stock the Business
        // does not hold; ALLOW books the shortfall as a backorder, which the
        // ledger then shows as a negative Available (ADR 0004).
        const strict = order.business.backorderPolicy === 'STRICT';
        const positions = await this.stock.positions(
          tx,
          goods.map((line) => line.itemId),
        );
        for (const line of goods) {
          const available = positions.get(line.itemId)!.available;
          if (strict && available.lt(new Decimal(line.quantity))) {
            throw new DomainError(
              'INSUFFICIENT_STOCK',
              `Ordering ${line.quantity} of ${line.itemId} would oversell: Available is ` +
                `${available.toFixed(3)} and the STRICT policy refuses to promise stock the ` +
                'Business does not hold.',
              {
                itemId: line.itemId,
                quantity: line.quantity,
                available: available.toFixed(3),
                backorderPolicy: order.business.backorderPolicy,
              },
            );
          }
        }
      }

      const now = new Date();
      const year = now.getUTCFullYear();
      const sequence = await this.numbering.allocate(tx, SALES_ORDER, year);
      const allocated = await this.numbering.render(tx, SALES_ORDER, sequence, year);

      const totals = orderTotals(priced);

      for (const [position, line] of priced.entries()) {
        const stored = order.lines[position];
        if (!stored) throw notFound('Sales Order line', `${id}:${position}`);
        await tx.documentLine.update({
          where: { id: stored.id },
          data: orderLineRow(line, position),
        });
      }
      await tx.documentTaxGroup.deleteMany({ where: { documentId: order.id } });
      await tx.documentTaxGroup.createMany({
        data: totals.taxGroups.map((group, position) => ({
          documentId: order.id,
          position,
          rate: group.rate,
          base: group.base,
          amount: group.amount,
        })),
      });

      // Reservation per goods line, in document order. The position indexes into
      // `order.lines`, which `priceItems` was fed in the same order, so `position`
      // names the same line here as it did when the issue began.
      for (const [position, line] of priced.entries()) {
        if (line.itemType === 'SERVICE') continue;
        const stored = order.lines[position];
        invariant(stored, `Line ${position} vanished while issuing ${order.id}.`);

        await tx.reservation.create({
          data: {
            itemId: line.itemId,
            salesOrderId: order.id,
            salesOrderLineId: stored.id,
            quantity: new Decimal(line.quantity),
          },
        });
      }

      await tx.document.update({
        where: { id: order.id },
        data: {
          status: 'ISSUED',
          number: allocated.number,
          issuedAt: now,
          netAmount: totals.netAmount,
          taxAmount: totals.taxAmount,
          grossAmount: totals.grossAmount,
        },
      });

      await this.audit.record(
        tx,
        {
          action: 'sales-order.issued',
          entityType: SALES_ORDER,
          entityId: order.id,
          before: { status: 'DRAFT', number: null },
          after: { status: 'ISSUED', number: allocated.number },
        },
        { ...actor, ipAddress: ipAddress ?? null },
      );
    });

    const found = await this.findById(id);
    if (!found) throw notFound('Sales Order', id);
    return found;
  }

  /**
   * Cancel an order, Draft or Issued, releasing every open Reservation in the same
   * transaction as the status change. A cancelled order is history — the number
   * is burned even if it never shipped, because the series must stay gap-free.
   */
  async cancel(id: string, actor: AuditActor = {}, ipAddress?: string | null): Promise<SalesOrder> {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.document.findFirst({ where: { id, type: SALES_ORDER } });
      if (!order) throw notFound('Sales Order', id);
      if (order.status === 'CANCELLED') {
        throw conflict(`Order ${id} is already cancelled.`, { id });
      }
      if (!canTransition(SALES_ORDER, documentStatusSchema.parse(order.status), 'CANCELLED')) {
        throw conflict(`Order ${id} cannot move from ${order.status} to CANCELLED.`, {
          id,
          from: order.status,
          to: 'CANCELLED',
        });
      }

      const now = new Date();
      // Release before the status flips: at the moment of this UPDATE the order is
      // still Issued, so `available` already counts these as promised in.
      await tx.reservation.updateMany({
        where: { salesOrderId: order.id, releasedAt: null },
        data: { releasedAt: now },
      });
      await tx.document.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });

      await this.audit.record(
        tx,
        {
          action: 'sales-order.cancelled',
          entityType: SALES_ORDER,
          entityId: order.id,
          before: { status: order.status },
          after: { status: 'CANCELLED' },
        },
        { ...actor, ipAddress: ipAddress ?? null },
      );
    });

    const found = await this.findById(id);
    if (!found) throw notFound('Sales Order', id);
    return found;
  }

  /**
   * The open orders: Issued and not yet fully delivered, newest first. The
   * delivery screen's source (story 45). A fully-delivered order has every line's
   * Reservation released and is not open any more.
   */
  async listOpenOrders(): Promise<SalesOrder[]> {
    const orders = await this.prisma.document.findMany({
      where: { type: SALES_ORDER, status: 'ISSUED' },
      include: {
        lines: { orderBy: { position: 'asc' } },
        party: true,
        reservations: true,
      },
      orderBy: { issuedAt: 'desc' },
    });

    return orders
      .filter(
        (order) =>
          order.reservations.length > 0 &&
          order.reservations.some((reservation) => reservation.releasedAt === null),
      )
      .map((order) => toSalesOrder(order));
  }

  async findById(id: string): Promise<SalesOrder | null> {
    const order = await this.prisma.document.findFirst({
      where: { id, type: SALES_ORDER },
      include: { lines: { orderBy: { position: 'asc' } }, party: true, reservations: true },
    });
    if (!order) return null;
    return toSalesOrder(order);
  }

  async findByRequiredId(id: string): Promise<SalesOrder> {
    const order = await this.findById(id);
    if (!order) throw notFound('Sales Order', id);
    return order;
  }
}

/** The single default locale for an order, derived from the Business country. */
function localeFor(countryCode: string): string {
  return countryCode === 'TN' ? 'fr' : 'en';
}

/** The totals of priced lines, as the storage row wants them. */
function orderTotals(priced: readonly DocumentPricedLine[]): {
  netAmount: string;
  taxAmount: string;
  grossAmount: string;
  taxGroups: { rate: string; base: string; amount: string }[];
} {
  const groups = repriceTotals(priced);
  return {
    netAmount: groups.net.toString(),
    taxAmount: groups.tax.toString(),
    grossAmount: groups.gross.toString(),
    taxGroups: groups.taxByRate.map((group) => ({
      rate: group.rate,
      base: group.base.toString(),
      amount: group.amount.toString(),
    })),
  };
}

interface OrderLineRow {
  readonly position: number;
  readonly itemId: string;
  readonly unitOfMeasureId: string;
  readonly description: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly taxRate: string;
  readonly netAmount: string;
  readonly taxAmount: string;
  readonly grossAmount: string;
}

function orderLineRow(line: DocumentPricedLine, position: number): OrderLineRow {
  return {
    position,
    itemId: line.itemId,
    unitOfMeasureId: line.unitOfMeasureId,
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    taxRate: line.taxRate,
    netAmount: line.netAmount,
    taxAmount: line.taxAmount,
    grossAmount: line.grossAmount,
  };
}

/** Map an order row (lines, party, reservations) to the contract response. */
function toSalesOrder(order: DocumentWithReservation): SalesOrder {
  const deliveredByLine = new Map(
    order.reservations.map((reservation) => [
      reservation.salesOrderLineId,
      reservation.deliveredQuantity,
    ]),
  );

  return salesOrderSchema.parse({
    id: order.id,
    type: 'SALES_ORDER',
    status: order.status,
    number: order.number,
    partyId: order.partyId,
    issuedAt: order.issuedAt?.toISOString() ?? null,
    totals: {
      netAmount: order.netAmount.toString(),
      taxAmount: order.taxAmount.toString(),
      grossAmount: order.grossAmount.toString(),
      withholdingTaxAmount: order.withholdingTaxAmount.toString(),
      stampDutyAmount: order.stampDutyAmount.toString(),
    },
    businessId: order.businessId,
    party: {
      id: order.party.id,
      code: order.party.code,
      name: order.party.name,
      taxIdentifier: order.party.taxIdentifier,
      address: order.party.address,
      city: order.party.city,
      countryCode: order.party.countryCode,
    },
    lines: order.lines.map((line) => ({
      itemId: line.itemId,
      quantity: line.quantity.toString(),
      unitOfMeasureId: line.unitOfMeasureId,
      description: line.description,
      unitPrice: line.unitPrice.toString(),
      taxRate: line.taxRate.toString(),
      netAmount: line.netAmount.toString(),
      taxAmount: line.taxAmount.toString(),
      grossAmount: line.grossAmount.toString(),
      deliveredQuantity: (deliveredByLine.get(line.id) ?? new Decimal(0)).toString(),
    })),
  });
}
