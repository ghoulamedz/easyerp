/**
 * The Goods Receipt flow (spec 002 stories 81–84, ADR 0004, ADR 0005, ADR 0014).
 *
 * A Goods Receipt records what actually arrived. It moves stock by appending
 * `GOODS_RECEIPT` entries to the Stock Ledger inside one transaction under a
 * row lock. The difference between the quantity ordered and the quantity
 * received is kept as a Discrepancy record.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/index.js';

import {
  draftGoodsReceiptSchema,
  money,
  quantity,
  type GoodsReceipt as GoodsReceiptResponse,
} from '@easyerp/contracts';

import { AuditService, type AuditActor } from '../audit/audit.service.js';
import { invariant, notFound, validationFailed } from '../common/errors.js';
import { Amount } from '../finance/amount.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StockLedgerService } from '../inventory/stock-ledger.service.js';
import { DocumentNumberingService } from '../numbering/document-numbering.service.js';
import { paperLocale } from '../documents/paper-document.js';
import { goodsReceiptPaperView, type UnitCodes } from '../documents/paper-builders.js';
import { PaperPdfService } from '../documents/paper-pdf.service.js';
import { priceItems, repriceTotals, type DocumentPricedLine } from '../sales/price-document.js';

export const GOODS_RECEIPT = 'GOODS_RECEIPT';
export const GOODS_RECEIPT_REASON = 'GOODS_RECEIPT';

@Injectable()
export class GoodsReceiptService {
  private readonly logger = new Logger(GoodsReceiptService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: DocumentNumberingService,
    private readonly stock: StockLedgerService,
    private readonly audit: AuditService,
    private readonly paperPdfs: PaperPdfService,
  ) {}

  /**
   * Create and issue a Goods Receipt. A receipt is issued immediately — it
   * moves stock and is immutable once created.
   */
  async createAndIssue(
    payload: unknown,
    actor: AuditActor = {},
    ipAddress?: string | null,
  ): Promise<GoodsReceiptResponse> {
    const input = draftGoodsReceiptSchema.parse(payload);

    const [business, party] = await Promise.all([
      this.prisma.business.findUnique({ where: { id: input.businessId } }),
      input.partyId
        ? this.prisma.party.findFirst({
            where: { id: input.partyId, isActive: true, roles: { has: 'SUPPLIER' } },
          })
        : Promise.resolve(null),
    ]);

    if (!business) throw notFound('Business', input.businessId);

    // Determine the party to use for the Document
    let documentPartyId: string | null = null;
    let validatedParty = null;

    if (input.partyId) {
      // Validate the provided party
      if (!party) {
        throw validationFailed(
          `No active Party ${input.partyId} holding the SUPPLIER role.`,
          { partyId: input.partyId },
        );
      }
      validatedParty = party;
      documentPartyId = party.id;
    } else if (input.purchaseOrderId) {
      // Use the party from the purchase order
      const purchaseOrder = await this.prisma.document.findFirst({
        where: { id: input.purchaseOrderId, type: 'PURCHASE_ORDER' },
        include: { lines: { orderBy: { position: 'asc' } }, purchaseOrders: { include: { lines: { orderBy: { position: 'asc' } } } } },
      });
      if (!purchaseOrder) throw notFound('Purchase Order', input.purchaseOrderId);
      if (purchaseOrder.status !== 'ISSUED') {
        throw validationFailed('A Goods Receipt can only be created against an issued Purchase Order.', { purchaseOrderId: input.purchaseOrderId });
      }
      // Get the purchase order details to access its party
      const purchaseOrderWithParty = await this.prisma.purchaseOrder.findUnique({
        where: { id: purchaseOrder.id },
        include: { party: true },
      });
      if (!purchaseOrderWithParty?.party) {
        throw validationFailed(
          `Purchase Order ${input.purchaseOrderId} has no associated party.`,
          { purchaseOrderId: input.purchaseOrderId },
        );
      }
      validatedParty = purchaseOrderWithParty.party;
      documentPartyId = purchaseOrderWithParty.party.id;
    } else {
      // Neither partyId nor purchaseOrderId provided
      throw validationFailed(
        'Either partyId or purchaseOrderId must be provided for a Goods Receipt.',
        { },
      );
    }

    let purchaseOrder = null;
    if (input.purchaseOrderId) {
      purchaseOrder = await this.prisma.document.findFirst({
        where: { id: input.purchaseOrderId, type: 'PURCHASE_ORDER' },
        include: { lines: { orderBy: { position: 'asc' } }, purchaseOrders: { include: { lines: { orderBy: { position: 'asc' } } } } },
      });
      if (!purchaseOrder) throw notFound('Purchase Order', input.purchaseOrderId);
      if (purchaseOrder.status !== 'ISSUED') {
        throw validationFailed('A Goods Receipt can only be created against an issued Purchase Order.', { purchaseOrderId: input.purchaseOrderId });
      }
    }

    const priced = await priceItems(this.prisma, input.lines);
    const totals = documentTotals(priced);

    const issued = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const year = now.getUTCFullYear();
      const sequence = await this.numbering.allocate(tx, GOODS_RECEIPT, year);
      const allocated = await this.numbering.render(tx, GOODS_RECEIPT, sequence, year);

      const receipt = await tx.document.create({
        data: {
          type: GOODS_RECEIPT,
          status: 'ISSUED',
          businessId: business.id,
          partyId: documentPartyId,
          locale: business.countryCode === 'TN' ? 'fr' : 'en',
          vatRegime: business.vatRegime,
          currency: business.currency,
          netAmount: totals.netAmount,
          taxAmount: totals.taxAmount,
          grossAmount: totals.grossAmount,
          number: allocated.number,
          issuedAt: now,
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
          goodsReceipts: {
            create: {
              purchaseOrderId: purchaseOrder?.id ?? null,
              partyId: validatedParty?.id ?? null,
              lines: {
                create: input.lines.map((line, index) => ({
                  position: index,
                  itemId: line.itemId,
                  description: line.description ?? '',
                  quantity: line.quantity,
                  unitOfMeasureId: line.unitOfMeasureId ?? '',
                  purchaseOrderLineId: line.purchaseOrderLineId ?? null,
                })),
              },
            },
          },
        },
        include: {
          lines: { orderBy: { position: 'asc' } },
          taxes: { orderBy: { position: 'asc' } },
          goodsReceipts: { include: { lines: { orderBy: { position: 'asc' } } } },
          party: true,
        },
      });

      // Create stock ledger entries and discrepancies
      if (purchaseOrder) {
        await this.appendLedgerEntriesAndDiscrepancies(
          tx,
          receipt.id!,
          receipt.goodsReceipts[0]!.lines!,
          purchaseOrder,
        );
      } else {
        // Standalone receipt: just append ledger entries
        for (const line of receipt.goodsReceipts[0]!.lines!) {
          await this.stock.appendEntry(
            tx,
            {
              itemId: line.itemId,
              quantity: new Prisma.Decimal(line.quantity.toString()),
              reason: GOODS_RECEIPT_REASON,
              documentType: GOODS_RECEIPT,
              documentId: receipt.id!,
              reasonText: `Goods Receipt ${allocated.number}`,
            },
          );
        }
      }

      await this.audit.record(
        tx,
        {
          action: 'goods-receipt.issued',
          entityType: GOODS_RECEIPT,
          entityId: receipt.id,
          after: { number: allocated.number, grossAmount: totals.grossAmount },
        },
        { ...actor, ipAddress: ipAddress ?? null },
      );

      return { receiptId: receipt.id, allocatedNumber: allocated.number, year };
    });

    // A receipt issues immutably in one transaction; its paper archives just
    // after the commit, like every other document's.
    try {
      await this.archiveIssuePaper(issued.receiptId, issued.year);
    } catch (error) {
      this.logger.error(
        `Archiving goods receipt ${issued.receiptId} failed; View will report its archive unavailable.`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    const found = await this.findById(issued.receiptId);
    invariant(found, `Goods Receipt ${issued.receiptId} vanished immediately after issuing.`);
    return found;
  }

  /** The archived paper, served as the artifact a client keeps (ADR 0010). */
  readPdf(id: string) {
    return this.paperPdfs.readArchive('GOODS_RECEIPT', id);
  }

  /** Build the committed receipt's paper view and archive it. */
  private async archiveIssuePaper(receiptId: string, issueYear: number): Promise<void> {
    const found = (await this.findById(receiptId)) as GoodsReceiptResponse;
    const row = await this.prisma.document.findFirst({
      where: { id: receiptId, type: GOODS_RECEIPT, status: 'ISSUED' },
      select: { number: true, issuedAt: true, locale: true, businessId: true },
    });
    invariant(
      row?.number && row.issuedAt && found,
      `Issued receipt ${receiptId} vanished before archiving.`,
    );

    const business = await this.prisma.business.findUnique({ where: { id: row.businessId } });
    if (!business) throw notFound('Business', row.businessId);

    const view = goodsReceiptPaperView(
      found,
      business,
      await this.unitCodes(receiptId),
      paperLocale(row.locale),
    );
    await this.paperPdfs.archiveAtIssue('GOODS_RECEIPT', receiptId, issueYear, row.number, view);
  }

  /** Unit codes for the receipt's child-line units, resolved in one query. */
  private async unitCodes(receiptId: string): Promise<UnitCodes> {
    const rows = await this.prisma.document.findFirst({
      where: { id: receiptId, type: GOODS_RECEIPT },
      select: { goodsReceipts: { include: { lines: { select: { unitOfMeasureId: true } } } } },
    });
    const ids = [
      ...new Set((rows?.goodsReceipts[0]?.lines ?? []).map((line) => line.unitOfMeasureId)),
    ].filter((id) => id !== '');
    if (ids.length === 0) return new Map();
    const units = await this.prisma.unit.findMany({
      where: { id: { in: ids } },
      select: { id: true, code: true },
    });
    return new Map(units.map((unit) => [unit.id, unit.code]));
  }

  private async appendLedgerEntriesAndDiscrepancies(
    tx: Prisma.TransactionClient,
    receiptId: string,
    receiptLines: { itemId: string; quantity: Prisma.Decimal; unitOfMeasureId: string; description: string; purchaseOrderLineId: string | null; position: number; id: string }[],
    purchaseOrder: { purchaseOrders: { id: string; lines: { id: string; quantity: Prisma.Decimal; unitOfMeasureId: string }[] }[] } | null,
  ): Promise<void> {
    // Map purchase order lines by position for discrepancy comparison, read
    // through the caller's transaction so the comparison sees its own rows.
    const poLinesByPosition = new Map();
    if (purchaseOrder?.purchaseOrders?.[0]) {
      const purchaseOrderLines = await tx.purchaseOrderLine.findMany({
        where: { purchaseOrderId: purchaseOrder.purchaseOrders[0].id },
        orderBy: { position: 'asc' },
      });
      for (const line of purchaseOrderLines) {
        poLinesByPosition.set(line.position, line);
      }
    }

    for (const receiptLine of receiptLines) {
      const poLine = poLinesByPosition.get(receiptLine.position);

      // Append stock ledger entry
      await this.stock.appendEntry(
        tx,
        {
          itemId: receiptLine.itemId,
          quantity: new Prisma.Decimal(receiptLine.quantity.toString()),
          reason: GOODS_RECEIPT_REASON,
          documentType: GOODS_RECEIPT,
          documentId: receiptId,
          reasonText: `Goods Receipt line ${receiptLine.position + 1}`,
        },
      );

      // Create discrepancy if linked to a purchase order line
      if (poLine) {
        const expected = Amount.parse(poLine.quantity.toString());
        const actual = Amount.parse(receiptLine.quantity.toString());
        if (!expected.equals(actual)) {
          const direction = actual.compare(expected) > 0 ? 'OVER' : 'SHORT';
          await tx.discrepancy.create({
            data: {
              documentType: GOODS_RECEIPT,
              documentId: receiptId,
              lineId: receiptLine.id,
              expectedQuantity: expected.toString(),
              actualQuantity: actual.toString(),
              direction,
            },
          });
        }
      }
    }
  }

  async findById(id: string): Promise<GoodsReceiptResponse | null> {
    const receipt = await this.prisma.document.findFirst({
      where: { id, type: GOODS_RECEIPT },
      include: {
        lines: { orderBy: { position: 'asc' } },
        taxes: { orderBy: { position: 'asc' } },
        party: true,
        goodsReceipts: {
          include: {
            lines: { orderBy: { position: 'asc' } },
            purchaseOrder: {
              include: {
                lines: { orderBy: { position: 'asc' } },
                document: true,
              },
            },
          },
        },
      },
    });

    if (!receipt) return null;

    const gr = receipt.goodsReceipts[0];
    invariant(gr, `Goods Receipt ${id} has no goodsReceipt relation`);

    return {
      id: receipt.id,
      type: 'GOODS_RECEIPT',
      status: receipt.status as GoodsReceiptResponse['status'],
      number: receipt.number,
      partyId: receipt.partyId,
      issuedAt: receipt.issuedAt?.toISOString() ?? null,
      totals: {
        netAmount: money(receipt.netAmount.toString()),
        fodecAmount: money(fodecTotal(receipt.lines)),
        taxAmount: money(receipt.taxAmount.toString()),
        grossAmount: money(receipt.grossAmount.toString()),
        withholdingTaxAmount: money(receipt.withholdingTaxAmount.toString()),
        stampDutyAmount: money(receipt.stampDutyAmount.toString()),
      },
      businessId: receipt.businessId,
      party: receipt.party
        ? {
            id: receipt.party.id,
            code: receipt.party.code,
            name: receipt.party.name,
            address: receipt.party.address,
            city: receipt.party.city,
            countryCode: receipt.party.countryCode,
          }
        : null,
      purchaseOrderId: gr.purchaseOrderId,
      purchaseOrderNumber: gr.purchaseOrder?.document?.number ?? null,
      lines: gr.lines.map((line) => ({
        id: line.id,
        itemId: line.itemId,
        description: line.description,
        quantity: quantity(line.quantity.toString()),
        unitOfMeasureId: line.unitOfMeasureId,
        purchaseOrderLineId: line.purchaseOrderLineId,
      })),
    };
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
  readonly fodecAmount: string;
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
    fodecAmount: line.fodecAmount,
    taxAmount: line.taxAmount,
    grossAmount: line.grossAmount,
  };
}

/**
 * The served FODEC total. There is no `Document.fodecAmount` column by design
 * (migration 20261013180000): the total is the sum of the stored generic line
 * figures, so the total and the lines cannot disagree.
 */
function fodecTotal(lines: readonly { fodecAmount: { toString(): string } }[]): string {
  return lines
    .reduce(
      (total, line) => total.plus(Amount.parse(line.fodecAmount.toString())),
      Amount.zero(),
    )
    .toString();
}