/**
 * The Purchase Order flow (spec 002 stories 77–80, ADR 0005, ADR 0006, ADR 0014).
 *
 * A Purchase Order is a commitment to buy. It is Draft then Issued with its own
 * series. Prices are resolved server-side from the Item's purchase price at
 * draft-pricing time and re-read at issue. A client cannot post a price.
 */

import { Injectable } from '@nestjs/common';

import {
  draftPurchaseOrderSchema,
  purchaseOrderUpdateSchema,
  money,
  quantity,
  rate,
  type PurchaseOrder as PurchaseOrderResponse,
} from '@easyerp/contracts';

import { AuditService, type AuditActor } from '../audit/audit.service.js';
import { conflict, notFound, validationFailed } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DocumentNumberingService } from '../numbering/document-numbering.service.js';
import { priceItems, repriceTotals, type DocumentPricedLine } from '../sales/price-document.js';

export const PURCHASE_ORDER = 'PURCHASE_ORDER';

@Injectable()
export class PurchaseOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: DocumentNumberingService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Create a Draft Purchase Order. No number — a number exists only once the
   * document is Issued (ADR 0006) — but real prices, so it can be reviewed.
   */
  async createDraft(
    payload: unknown,
    actor: AuditActor = {},
    ipAddress?: string | null,
  ): Promise<{ id: string; status: string }> {
    const input = draftPurchaseOrderSchema.parse(payload);

    const [business, party] = await Promise.all([
      this.prisma.business.findUnique({ where: { id: input.businessId } }),
      input.partyId
        ? this.prisma.party.findFirst({
            where: { id: input.partyId, isActive: true, roles: { has: 'SUPPLIER' } },
          })
        : Promise.resolve(null),
    ]);

    if (!business) throw notFound('Business', input.businessId);
    if (!input.partyId) {
      throw validationFailed(
        'partyId is required for Purchase Order.',
        { partyId: input.partyId },
      );
    }
    if (!party) {
      throw validationFailed(
        `No active Party ${input.partyId} holding the SUPPLIER role.`,
        { partyId: input.partyId },
      );
    }

    const priced = await priceItems(this.prisma, input.lines);
    const totals = documentTotals(priced);

    const created = await this.prisma.document.create({
      data: {
        type: PURCHASE_ORDER,
        status: 'DRAFT',
        businessId: business.id,
        partyId: party.id,
        locale: 'fr',
        vatRegime: business.vatRegime,
        currency: business.currency,
        netAmount: totals.netAmount,
        taxAmount: totals.taxAmount,
        grossAmount: totals.grossAmount,
        lines: {
          create: priced.map((line, position) => lineRow(line, position)),
        },
        taxes: {
          create: totals.taxGroups.map((group, position) => ({
            position,
            rate: group.rate,
            base: group.base,
            amount: group.amount,
          })),
        },
        purchaseOrders: {
          create: {
            partyId: party.id,
            lines: {
              create: priced.map((line, position) => ({
                position,
                itemId: line.itemId,
                description: line.description,
                quantity: line.quantity,
                unitOfMeasureId: line.unitOfMeasureId,
              })),
            },
          },
        },
      },
      select: { id: true, status: true },
    });

    await this.audit.record(
      this.prisma,
      {
        action: 'purchase-order.drafted',
        entityType: PURCHASE_ORDER,
        entityId: created.id,
        after: { status: created.status, grossAmount: totals.grossAmount },
      },
      { ...actor, ipAddress: ipAddress ?? null },
    );

    return { id: created.id, status: created.status };
  }

  /**
   * Update a Draft Purchase Order. Lines replace the whole set.
   */
  async updateDraft(
    orderId: string,
    payload: unknown,
    actor: AuditActor = {},
    ipAddress?: string | null,
  ): Promise<PurchaseOrderResponse> {
    const input = purchaseOrderUpdateSchema.parse(payload);

    const order = await this.prisma.document.findFirst({
      where: { id: orderId, type: PURCHASE_ORDER },
      include: { lines: true, purchaseOrders: { include: { lines: { orderBy: { position: 'asc' } } } } },
    });

    if (!order) throw notFound('Purchase Order', orderId);
    if (order.status !== 'DRAFT') {
      throw conflict(
        `Purchase Order ${orderId} is not a draft.`,
        { id: orderId, status: order.status },
      );
    }

    let partyId = order.partyId;

    // Determine line count for audit
    let lineCountForAudit = 0;
    let priced: DocumentPricedLine[] = [];

    if (input.lines) {
      priced = await priceItems(this.prisma, input.lines);
      const totals = documentTotals(priced);
      lineCountForAudit = priced.length;

      await this.prisma.documentLine.deleteMany({ where: { documentId: orderId } });
      await this.prisma.documentTaxGroup.deleteMany({ where: { documentId: orderId } });
      await this.prisma.purchaseOrderLine.deleteMany({
        where: { purchaseOrderId: order.purchaseOrders?.[0]?.id },
      });

      await this.prisma.document.update({
        where: { id: orderId },
        data: {
          netAmount: totals.netAmount,
          taxAmount: totals.taxAmount,
          grossAmount: totals.grossAmount,
          lines: {
            create: priced.map((line, position) => lineRow(line, position)),
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
      });

      // Create new purchase order lines
      const purchaseOrderId = order.purchaseOrders?.[0]?.id;
      if (!purchaseOrderId) {
        throw new Error('Purchase order not found');
      }
      await this.prisma.purchaseOrderLine.createMany({
        data: priced.map((line, position) => ({
          purchaseOrderId,
          position,
          itemId: line.itemId,
          description: line.description,
          quantity: line.quantity,
          unitOfMeasureId: line.unitOfMeasureId,
        })),
      });
    } else {
      // No input lines, so line count is the existing lines
      lineCountForAudit = order.lines.length;
    }

    if (input.partyId) {
      const newParty = await this.prisma.party.findFirst({
        where: { id: input.partyId, isActive: true, roles: { has: 'SUPPLIER' } },
      });
      if (!newParty) {
        throw validationFailed(
          `No active Party ${input.partyId} holding the SUPPLIER role.`,
          { partyId: input.partyId },
        );
      }
      partyId = newParty.id;
      await this.prisma.document.update({
        where: { id: orderId },
        data: { partyId },
      });
      // Also update the PurchaseOrder's partyId
      if (order.purchaseOrders?.[0]) {
        await this.prisma.purchaseOrder.update({
          where: { id: order.purchaseOrders[0].id },
          data: { partyId },
        });
      }
    }

    await this.audit.record(
      this.prisma,
      {
        action: 'purchase-order.updated',
        entityType: PURCHASE_ORDER,
        entityId: orderId,
        after: { partyId, lineCount: lineCountForAudit },
      },
      { ...actor, ipAddress: ipAddress ??null },
    );

    return this.findById(orderId) as Promise<PurchaseOrderResponse>;
  }

  /**
   * Issue a Draft Purchase Order: number it, re-price it, make it immutable.
   */
  async issue(
    orderId: string,
    actor: AuditActor = {},
    ipAddress?: string | null,
  ): Promise<PurchaseOrderResponse> {
    const issued = await this.prisma.$transaction(async (tx) => {
      const order = await tx.document.findFirst({
        where: { id: orderId, type: PURCHASE_ORDER },
        include: {
          lines: { orderBy: { position: 'asc' } },
          purchaseOrders: { include: { lines: { orderBy: { position: 'asc' } } } },
          business: true,
          party: true,
        },
      });

      if (!order) throw notFound('Purchase Order', orderId);

      if (order.status === 'ISSUED') {
        throw conflict(
          `Order ${orderId} is already issued as ${order.number}.`,
          { id: orderId, number: order.number },
        );
      }

      if (order.lines.length === 0) {
        throw validationFailed('A Draft with no lines cannot be issued.', { id: orderId });
      }

      const now = new Date();
      const year = now.getUTCFullYear();
      const sequence = await this.numbering.allocate(tx, PURCHASE_ORDER, year);
      const allocated = await this.numbering.render(tx, PURCHASE_ORDER, sequence, year);
      // Authoritative re-pricing
      const priced = await priceItems(
        tx,
        order.lines.map(({ itemId, quantity: qty }) => ({
          itemId,
          quantity: quantity(qty.toString()),
        })),
      );
      const totals = documentTotals(priced);

      for (const [position, line] of priced.entries()) {
        const stored = order.lines[position];
        if (!stored) throw new Error(`Line ${position} vanished while issuing ${orderId}.`);

        await tx.documentLine.update({
          where: { id: stored.id },
          data: lineRow(line, position),
        });
      }

      await tx.documentTaxGroup.deleteMany({ where: { documentId: order.id } });
      for (const [position, group] of totals.taxGroups.entries()) {
        await tx.documentTaxGroup.create({
          data: {
            documentId: order.id,
            position,
            rate: group.rate,
            base: group.base,
            amount: group.amount,
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
          action: 'purchase-order.issued',
          entityType: PURCHASE_ORDER,
          entityId: order.id,
          before: { status: 'DRAFT', number: null },
          after: { status: 'ISSUED', number: allocated.number },
        },
        { ...actor, ipAddress: ipAddress ?? null },
      );

      return { orderId: order.id };
    });

    const found = await this.findById(issued.orderId);
    if (!found) throw new Error(`Order ${issued.orderId} vanished immediately after issuing.`);
    return found;
  }

  /**
   * Cancel an Issued Purchase Order.
   */
  async cancel(
    orderId: string,
    actor: AuditActor = {},
    ipAddress?: string | null,
  ): Promise<PurchaseOrderResponse> {
    const cancelled = await this.prisma.$transaction(async (tx) => {
      const order = await tx.document.findFirst({
        where: { id: orderId, type: PURCHASE_ORDER },
      });

      if (!order) throw notFound('Purchase Order', orderId);

      if (order.status !== 'ISSUED') {
        throw conflict(
          `Only an issued Purchase Order can be cancelled.`,
          { id: orderId, status: order.status },
        );
      }

      await tx.document.update({
        where: { id: orderId },
        data: { status: 'CANCELLED' },
      });

      await this.audit.record(
        tx,
        {
          action: 'purchase-order.cancelled',
          entityType: PURCHASE_ORDER,
          entityId: orderId,
          before: { status: 'ISSUED', number: order.number },
          after: { status: 'CANCELLED' },
        },
        { ...actor, ipAddress: ipAddress ?? null },
      );

      return { orderId };
    });

    const found = await this.findById(cancelled.orderId);
    if (!found) throw new Error(`Order ${cancelled.orderId} vanished after cancelling.`);
    return found;
  }

  async findById(id: string): Promise<PurchaseOrderResponse | null> {
    const order = await this.prisma.document.findFirst({
      where: { id, type: PURCHASE_ORDER },
      include: {
        lines: { orderBy: { position: 'asc' } },
        taxes: { orderBy: { position: 'asc' } },
        party: true,
        purchaseOrders: {
          include: { lines: { orderBy: { position: 'asc' } } },
        },
      },
    });

    if (!order) return null;

    return {
      id: order.id,
      type: 'PURCHASE_ORDER',
      status: order.status as PurchaseOrderResponse['status'],
      number: order.number,
      partyId: order.partyId,
      issuedAt: order.issuedAt?.toISOString() ?? null,
      totals: {
        netAmount: money(order.netAmount.toString()),
        taxAmount: money(order.taxAmount.toString()),
        grossAmount: money(order.grossAmount.toString()),
        withholdingTaxAmount: money(order.withholdingTaxAmount.toString()),
        stampDutyAmount: money(order.stampDutyAmount.toString()),
      },
      businessId: order.businessId,
      party: order.party
        ? {
            id: order.party.id,
            code: order.party.code,
            name: order.party.name,
            taxIdentifier: order.party.taxIdentifier,
            address: order.party.address,
            city: order.party.city,
            countryCode: order.party.countryCode,
          }
        : null,
      lines: order.lines.map((line) => ({
        itemId: line.itemId,
        unitOfMeasureId: line.unitOfMeasureId,
        description: line.description,
        quantity: quantity(line.quantity.toString()),
        unitPrice: money(line.unitPrice.toString()),
        taxRate: rate(line.taxRate.toString()),
        netAmount: money(line.netAmount.toString()),
        taxAmount: money(line.taxAmount.toString()),
        grossAmount: money(line.grossAmount.toString()),
      })),
      taxGroups: order.taxes.map((group) => ({
        rate: rate(group.rate.toString()),
        base: money(group.base.toString()),
        amount: money(group.amount.toString()),
      })),
    };
  }
}

/** The totals of a set of priced lines, as the storage row wants them. */
function documentTotals(priced: readonly DocumentPricedLine[]): {
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

/** The priced figure columns of a line, for the storage row. */
interface LineRow {
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

function lineRow(line: DocumentPricedLine, position: number): LineRow {
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