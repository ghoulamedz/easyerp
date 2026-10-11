/**
 * Production Order service (spec 002 stories 87–91, ADR 0004, ADR 0005, ADR 0014).
 *
 * A Production Order consumes a named BOM version and produces the finished Item.
 * Issuing consumes components and produces the finished Item in one transaction
 * under row locks. Cancellation appends REVERSAL entries.
 */

import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma';

import {
  draftProductionOrderSchema,
  productionOrderUpdateSchema,
  money,
  quantity,
  rate,
  type ProductionOrder as ProductionOrderResponse,
} from '@easyerp/contracts';

import { AuditService, type AuditActor } from '../audit/audit.service.js';
import { conflict, invariant, notFound, validationFailed } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StockLedgerService } from '../inventory/stock-ledger.service.js';
import { DocumentNumberingService } from '../numbering/document-numbering.service.js';
import { priceItems, repriceTotals, type DocumentPricedLine } from '../sales/price-document.js';

export const PRODUCTION_ORDER = 'PRODUCTION_ORDER';

@Injectable()
export class ProductionOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: DocumentNumberingService,
    private readonly stock: StockLedgerService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Create a Draft Production Order.
   */
  async createDraft(
    payload: unknown,
    actor: AuditActor = {},
    ipAddress?: string | null,
  ): Promise<{ id: string; status: string }> {
    const input = draftProductionOrderSchema.parse(payload);

    const [business, bomVersion] = await Promise.all([
      this.prisma.business.findUnique({ where: { id: input.businessId } }),
      this.prisma.bomVersion.findUnique({
        where: { id: input.bomVersionId },
        include: { lines: { orderBy: { position: 'asc' } }, bom: true },
      }),
    ]);

    if (!business) throw notFound('Business', input.businessId);
    if (!bomVersion) throw notFound('BOM Version', input.bomVersionId);

    // Build lines from BOM version
    const lines = bomVersion.lines.map((line) => ({
      itemId: line.itemId,
      quantity: quantity(line.quantity.toString()),
      unitOfMeasureId: line.unitOfMeasureId,
    }));

    const priced = await priceItems(this.prisma, lines);
    const totals = documentTotals(priced);

    const internalParty = await this.prisma.party.findUniqueOrThrow({ where: { code: 'INTERNAL' } });
    const created = await this.prisma.document.create({
      data: {
        type: PRODUCTION_ORDER,
        status: 'DRAFT',
        businessId: business.id,
        partyId: internalParty.id,
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
        productionOrders: {
          create: {
            bomVersion: { connect: { id: input.bomVersionId } },
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
        action: 'production-order.drafted',
        entityType: PRODUCTION_ORDER,
        entityId: created.id,
        after: { status: created.status, grossAmount: totals.grossAmount },
      },
      { ...actor, ipAddress: ipAddress ?? null },
    );

    return { id: created.id, status: created.status };
  }

  /**
   * Update a Draft Production Order. Lines replace the whole set.
   */
  async updateDraft(
    orderId: string,
    payload: unknown,
    actor: AuditActor = {},
    ipAddress?: string | null,
  ): Promise<ProductionOrderResponse> {
    const input = productionOrderUpdateSchema.parse(payload);

    const order = await this.prisma.document.findFirst({
      where: { id: orderId, type: PRODUCTION_ORDER },
      include: { lines: true, productionOrders: { include: { lines: true } } },
    });

    if (!order) throw notFound('Production Order', orderId);
    if (order.status !== 'DRAFT') {
      throw conflict(
        `Production Order ${orderId} is not a draft.`,
        { id: orderId, status: order.status },
      );
    }

    if (input.lines) {
      const priced = await priceItems(this.prisma, input.lines);
      const totals = documentTotals(priced);

      await this.prisma.documentLine.deleteMany({ where: { documentId: orderId } });
      await this.prisma.documentTaxGroup.deleteMany({ where: { documentId: orderId } });
      await this.prisma.productionOrderLine.deleteMany({
        where: { productionOrderId: order.productionOrders?.[0]?.id },
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

      // Update production order lines (delete and recreate)
      const poId = order.productionOrders?.[0]?.id;
      if (poId) {
        await this.prisma.productionOrderLine.deleteMany({ where: { productionOrderId: poId } });
        await this.prisma.productionOrder.update({
          where: { id: poId },
          data: {
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
        });
      }
    }

    await this.audit.record(
      this.prisma,
      {
        action: 'production-order.updated',
        entityType: PRODUCTION_ORDER,
        entityId: orderId,
        after: { lineCount: input.lines?.length ?? 0 },
      },
      { ...actor, ipAddress: ipAddress ?? null },
    );

    return this.findById(orderId) as Promise<ProductionOrderResponse>;
  }

  /**
   * Issue a Draft Production Order: consume components and produce finished Item.
   */
  async issue(
    orderId: string,
    actor: AuditActor = {},
    ipAddress?: string | null,
  ): Promise<ProductionOrderResponse> {
    const issued = await this.prisma.$transaction(async (tx) => {
      const order = await tx.document.findFirst({
        where: { id: orderId, type: PRODUCTION_ORDER },
        include: {
          lines: { orderBy: { position: 'asc' } },
          productionOrders: {
            include: { lines: { orderBy: { position: 'asc' } }, bomVersion: { include: { bom: true, lines: { orderBy: { position: 'asc' } } } } },
          },
          business: true,
        },
      });

      if (!order) throw notFound('Production Order', orderId);

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
      const sequence = await this.numbering.allocate(tx, PRODUCTION_ORDER, year);
      const allocated = await this.numbering.render(tx, PRODUCTION_ORDER, sequence, year);

      // Re-read BOM version lines for authoritative component requirements
      const po = order.productionOrders[0];
      if (!po) throw notFound('Production Order relation', orderId);
      const bomVersion = await tx.bomVersion.findUnique({
        where: { id: po.bomVersionId },
        include: { lines: { orderBy: { position: 'asc' } }, bom: true },
      });
      if (!bomVersion) throw notFound('BOM Version', po.bomVersionId);

      // Check backorder policy for components (STRICT/ALLOW)
      const business = await tx.business.findUnique({ where: { id: order.businessId } });
      if (!business) throw notFound('Business', order.businessId);

      if (business.backorderPolicy === 'STRICT') {
        for (const component of bomVersion.lines) {
          const onHand = await this.getOnHand(tx, component.itemId);
          if (onHand < Number(component.quantity)) {
            throw conflict(
              `Insufficient stock for component ${component.itemId}. Available: ${onHand}, Required: ${component.quantity}`,
              { itemId: component.itemId, available: onHand, required: component.quantity },
            );
          }
        }
      }

      // Update document lines with BOM version snapshot
      await tx.documentLine.deleteMany({ where: { documentId: order.id } });
      await tx.documentTaxGroup.deleteMany({ where: { documentId: order.id } });
      await tx.productionOrderLine.deleteMany({ where: { productionOrderId: po.id } });

      const priced = await priceItems(
        tx,
        bomVersion.lines.map((line) => ({
          itemId: line.itemId,
          quantity: quantity(line.quantity.toString()),
          unitOfMeasureId: line.unitOfMeasureId,
        })),
      );
      const totals = documentTotals(priced);

      for (const [position, line] of priced.entries()) {
        await tx.documentLine.create({
          data: { ...lineRow(line, position), documentId: order.id },
        });
      }
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

      await tx.productionOrder.update({
        where: { id: po.id },
        data: {
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
      });

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

      // Consume components and produce finished item
      for (const component of bomVersion.lines) {
        await this.stock.appendEntry(
          tx,
          {
            itemId: component.itemId,
            quantity: new Prisma.Decimal(component.quantity.toString()),
            reason: 'PRODUCTION_OUT',
            documentType: PRODUCTION_ORDER,
            documentId: order.id,
            reasonText: `Production consumption: ${bomVersion.bom.finishedItemId}`,
          },
        );
      }

      // Produce finished item
      await this.stock.appendEntry(
        tx,
        {
          itemId: bomVersion.bom.finishedItemId,
          quantity: new Prisma.Decimal(bomVersion.lines[0]?.quantity.toString() ?? '1'),
          reason: 'PRODUCTION_IN',
          documentType: PRODUCTION_ORDER,
          documentId: order.id,
          reasonText: `Production output: ${allocated.number}`,
        },
      );

      await this.audit.record(
        tx,
        {
          action: 'production-order.issued',
          entityType: PRODUCTION_ORDER,
          entityId: order.id,
          before: { status: 'DRAFT', number: null },
          after: { status: 'ISSUED', number: allocated.number },
        },
        { ...actor, ipAddress: ipAddress ?? null },
      );

      return { orderId: order.id };
    });

    const found = await this.findById(issued.orderId);
    invariant(found, `Order ${issued.orderId} vanished immediately after issuing.`);
    return found;
  }

  /**
   * Cancel an Issued Production Order: append REVERSAL entries.
   */
  async cancel(
    orderId: string,
    actor: AuditActor = {},
    ipAddress?: string | null,
  ): Promise<ProductionOrderResponse> {
    const cancelled = await this.prisma.$transaction(async (tx) => {
      const order = await tx.document.findFirst({
        where: { id: orderId, type: PRODUCTION_ORDER },
        include: {
          productionOrders: {
            include: { bomVersion: { include: { bom: true, lines: true } } },
          },
        },
      });

      if (!order) throw notFound('Production Order', orderId);

      if (order.status !== 'ISSUED') {
        throw conflict(
          `Only an issued Production Order can be cancelled.`,
          { id: orderId, status: order.status },
        );
      }

      // Reverse: return components, consume finished item
      const po = order.productionOrders[0];
      if (!po) throw notFound('Production Order relation', orderId);
      const bomVersion = po.bomVersion;

      for (const component of bomVersion.lines) {
        await this.stock.appendEntry(
          tx,
          {
            itemId: component.itemId,
            quantity: new Prisma.Decimal(component.quantity.toString()),
            reason: 'REVERSAL',
            documentType: PRODUCTION_ORDER,
            documentId: order.id,
            reasonText: `Reversal of production: ${order.number}`,
          },
        );
      }

      // Consume finished item
      await this.stock.appendEntry(
        tx,
        {
          itemId: bomVersion.bom.finishedItemId,
          quantity: new Prisma.Decimal(`-${bomVersion.lines[0]?.quantity.toString() ?? '1'}`),
          reason: 'REVERSAL',
          documentType: PRODUCTION_ORDER,
          documentId: order.id,
          reasonText: `Reversal of production output: ${order.number}`,
        },
      );

      await tx.document.update({
        where: { id: orderId },
        data: { status: 'CANCELLED' },
      });

      await this.audit.record(
        tx,
        {
          action: 'production-order.cancelled',
          entityType: PRODUCTION_ORDER,
          entityId: orderId,
          before: { status: 'ISSUED', number: order.number },
          after: { status: 'CANCELLED' },
        },
        { ...actor, ipAddress: ipAddress ?? null },
      );

      return { orderId };
    });

    const found = await this.findById(cancelled.orderId);
    invariant(found, `Order ${cancelled.orderId} vanished after cancelling.`);
    return found;
  }

  async findById(id: string): Promise<ProductionOrderResponse | null> {
    const order = await this.prisma.document.findFirst({
      where: { id, type: PRODUCTION_ORDER },
      include: {
        lines: { orderBy: { position: 'asc' } },
        taxes: { orderBy: { position: 'asc' } },
        productionOrders: {
          include: { lines: { orderBy: { position: 'asc' } }, bomVersion: true },
        },
        business: true,
      },
    });

    if (!order) return null;

    return {
      id: order.id,
      type: 'PRODUCTION_ORDER',
      status: order.status as ProductionOrderResponse['status'],
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
    };
  }

  private async getOnHand(tx: Prisma.TransactionClient, itemId: string): Promise<number> {
    const entries = await tx.stockLedgerEntry.findMany({
      where: { itemId },
      select: { quantity: true },
    });
    return entries.reduce((sum: number, e: { quantity: Prisma.Decimal }) => sum + Number(e.quantity), 0);
  }
}

/** The totals of a set of priced lines. */
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