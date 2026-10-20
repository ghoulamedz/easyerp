/**
 * The Delivery Note (spec 001 stories 46–48, ADR 0004, ADR 0014).
 *
 * A note makes the Sales Order's promise concrete: it is the shipment. Issuing
 * one is the single moment stock actually leaves — each goods line becomes a
 * `DELIVERY_NOTE` Stock Ledger Entry, and each line that fulfils an order line
 * grows that line's Reservation (`deliveredQuantity`), releasing the Reservation
 * (and so the promise) once delivered in full.
 *
 * ## Over-delivery is refused, not absorbed
 *
 * A note may never deliver more than its order line has open — the Reservation's
 * original quantity minus what earlier notes already shipped. That invariant is
 * checked against the Reservation rows inside the issuing transaction, under row
 * locks, so two notes issued together cannot both claim the same units.
 *
 * ## The note is not fiscal
 *
 * It carries a number and is immutable once issued (ADR 0006 for the trigger),
 * its own `BL-` series, but it quotes no prices and no VAT: stock movements
 * live in the ledger, not in a file (ADR 0004). Its printed paper (ADR 0010)
 * is therefore a quantities-only document — what shipped, to whom, against
 * which order — never a priced one; the printed paper is served alongside every
 * other paper's.
 */

import { Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';

import {
  deliveryNoteSchema,
  deliveryNoteUpdateSchema,
  documentStatusSchema,
  draftDeliveryNoteSchema,
  money,
  quantity,
  type DeliveryNote,
} from '@easyerp/contracts';

import { AuditService, type AuditActor } from '../audit/audit.service.js';
import { conflict, invariant, notFound, validationFailed } from '../common/errors.js';
import { Prisma } from '../generated/prisma/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StockLedgerService } from '../inventory/stock-ledger.service.js';
import { DocumentNumberingService } from '../numbering/document-numbering.service.js';
import { paperLocale } from '../documents/paper-document.js';
import {
  deliveryNotePaperView,
  type UnitCodes,
} from '../documents/paper-builders.js';
import { renderPaperHtml } from '../documents/paper-template.js';
import type { PaperView } from '../documents/paper-document.js';

export const DELIVERY_NOTE = 'DELIVERY_NOTE';

type NoteWithOrderAndLines = Prisma.DocumentGetPayload<{
  include: {
    party: true;
    deliveryNotes: {
      include: {
        salesOrder: true;
        lines: { orderBy: { position: 'asc' } };
      };
    };
  };
}>;

@Injectable()
export class DeliveryNoteService {

  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: DocumentNumberingService,
    private readonly stock: StockLedgerService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Draft a note, optionally against an issued Sales Order.
   *
   * When it fulfils an order, the recipient is the order's Customer unless the
   * request names that same Customer again — never a different one, because a
   * note shipping somebody else's order would decouple the shipment from the
   * promise. The lines are resolved from the Items (description and unit),
   * never echoed from the request.
   */
  async createDraft(
    payload: unknown,
    actor: AuditActor = {},
    ipAddress?: string | null,
  ): Promise<{ id: string; status: string }> {
    const input = draftDeliveryNoteSchema.parse(payload);

    const business = await this.prisma.business.findUnique({ where: { id: input.businessId } });
    if (!business) throw notFound('Business', input.businessId);

    let order: NonNullable<Awaited<ReturnType<DeliveryNoteService['findOrder']>>> | null = null;
    if (input.salesOrderId) {
      order = await this.findOrder(input.salesOrderId);
      if (!order) throw notFound('Sales Order', input.salesOrderId);
      if (order.status !== 'ISSUED') {
        throw conflict(
          `Sales Order ${input.salesOrderId} is ${order.status}; only an issued order can be shipped against.`,
          { salesOrderId: input.salesOrderId, status: order.status },
        );
      }
    }

    const partyId = input.partyId ?? order?.partyId;
    if (!partyId) {
      throw validationFailed('A Delivery Note without a Sales Order must name its recipient.', {
        businessId: input.businessId,
      });
    }
    if (order && input.partyId && input.partyId !== order.partyId) {
      throw conflict(
        `A Delivery Note fulfilling ${input.salesOrderId} must ship to the order's Customer ` +
          `(${order.partyId}), not ${input.partyId}.`,
        { salesOrderId: input.salesOrderId, orderPartyId: order.partyId, partyId: input.partyId },
      );
    }

    const items = await this.prisma.item.findMany({
      where: {
        id: { in: [...new Set(input.lines.map((line) => line.itemId))] },
        isActive: true,
      },
    });
    const itemById = new Map(items.map((item) => [item.id, item]));

    const orderLineIds = new Set(order?.lines.map((line) => line.id) ?? []);

    const lines = input.lines.map((line, position) => {
      const item = itemById.get(line.itemId);
      if (!item) {
        throw validationFailed(
          `Item ${line.itemId} is missing or deactivated; goods must be real before they leave.`,
          { itemId: line.itemId },
        );
      }
      if (line.salesOrderLineId && !orderLineIds.has(line.salesOrderLineId)) {
        throw validationFailed(
          `Line ${position} names Sales Order line ${line.salesOrderLineId}, which does not belong ` +
            'to the order this note fulfils.',
          { salesOrderLineId: line.salesOrderLineId },
        );
      }
      return {
        position,
        itemId: item.id,
        description: line.description ?? item.description ?? item.name,
        quantity: new Decimal(line.quantity),
        unitOfMeasureId: item.saleUnitId ?? item.baseUnitId,
        salesOrderLineId: line.salesOrderLineId ?? null,
      };
    });

    const created = await this.prisma.document.create({
      data: {
        type: DELIVERY_NOTE,
        status: 'DRAFT',
        businessId: business.id,
        partyId,
        locale: business.countryCode === 'TN' ? 'fr' : 'en',
        vatRegime: business.vatRegime,
        currency: business.currency,
        deliveryNotes: {
          create: {
            salesOrderId: order?.id ?? null,
            lines: { create: lines },
          },
        },
      },
      select: { id: true, status: true },
    });

    await this.audit.record(
      this.prisma,
      {
        action: 'delivery-note.drafted',
        entityType: DELIVERY_NOTE,
        entityId: created.id,
        after: { status: created.status, salesOrderId: order?.id ?? null },
      },
      { ...actor, ipAddress: ipAddress ?? null },
    );

    return { id: created.id, status: created.status };
  }

  /**
   * Edit a Draft note: replace the line set, or change the recipient.
   *
   * Only a Draft, for the reason every document shares: an Issued note has moved
   * stock and released promises, and rewriting its lines would leave the ledger
   * describing goods the paper no longer mentions.
   *
   * The lines are rebuilt from the Items rather than patched in place, exactly as
   * `createDraft` does, so an edit cannot introduce a line that a create would have
   * refused — a deactivated Item, or a line pointing at another order's line.
   */
  async update(
    id: string,
    payload: unknown,
    actor: AuditActor = {},
    ipAddress?: string | null,
  ): Promise<{ id: string; status: string }> {
    const input = deliveryNoteUpdateSchema.parse(payload);

    const note = await this.prisma.document.findFirst({
      where: { id, type: DELIVERY_NOTE },
      include: { deliveryNotes: { include: { lines: { orderBy: { position: 'asc' } } } } },
    });
    if (!note) throw notFound('Delivery Note', id);
    if (note.status !== 'DRAFT') {
      throw conflict(
        `Only a Draft note can be edited; ${id} is ${note.status}. An issued note has shipped its ` +
          'goods and released its promises.',
        { id, status: note.status },
      );
    }

    const detail = note.deliveryNotes[0];
    invariant(detail, `Delivery Note ${id} has no detail row.`);

    let partyId = note.partyId;
    if (input.partyId !== undefined) {
      if (detail.salesOrderId !== null && input.partyId !== note.partyId) {
        throw conflict(
          `This note fulfils Sales Order ${detail.salesOrderId} and must ship to its Customer.`,
          { salesOrderId: detail.salesOrderId, partyId: input.partyId },
        );
      }
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

    if (input.lines === undefined) {
      await this.prisma.document.update({ where: { id }, data: { partyId } });
      return { id, status: note.status };
    }

    const order = detail.salesOrderId === null ? null : await this.findOrder(detail.salesOrderId);
    const orderLineIds = new Set(order?.lines.map((line) => line.id) ?? []);

    const items = await this.prisma.item.findMany({
      where: { id: { in: [...new Set(input.lines.map((line) => line.itemId))] }, isActive: true },
    });
    const itemById = new Map(items.map((item) => [item.id, item]));

    const lines = input.lines.map((line, position) => {
      const item = itemById.get(line.itemId);
      if (!item) {
        throw validationFailed(
          `Item ${line.itemId} is missing or deactivated; goods must be real before they leave.`,
          { itemId: line.itemId },
        );
      }
      if (line.salesOrderLineId && !orderLineIds.has(line.salesOrderLineId)) {
        throw validationFailed(
          `Line ${position} names Sales Order line ${line.salesOrderLineId}, which does not belong ` +
            'to the order this note fulfils.',
          { salesOrderLineId: line.salesOrderLineId },
        );
      }
      return {
        position,
        itemId: item.id,
        description: line.description ?? item.description ?? item.name,
        quantity: new Decimal(line.quantity),
        unitOfMeasureId: item.saleUnitId ?? item.baseUnitId,
        salesOrderLineId: line.salesOrderLineId ?? null,
      };
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.deliveryNoteLine.deleteMany({ where: { deliveryNoteId: detail.id } });
      await tx.document.update({ where: { id }, data: { partyId } });
      await tx.deliveryNoteLine.createMany({
        data: lines.map((line) => ({ ...line, deliveryNoteId: detail.id })),
      });
    });

    await this.audit.record(
      this.prisma,
      {
        action: 'delivery-note.updated',
        entityType: DELIVERY_NOTE,
        entityId: id,
        after: { status: note.status, lineCount: lines.length },
      },
      { ...actor, ipAddress: ipAddress ?? null },
    );

    return { id, status: note.status };
  }

  /**
   * Issue the note: number it, ship the goods, release the promises.
   *
   * One transaction. The Item rows are locked so two issuings cannot both read
   * the same availability; each goods line is checked against its Reservation
   * (unshipped enough? not already released?) and against the ledger (on-hand
   * never goes negative); then the entries are appended and the Reservations
   * grow. The note is Issued last, so a rejected issue leaves integrity intact.
   */
  async issue(
    noteId: string,
    actor: AuditActor = {},
    ipAddress?: string | null,
  ): Promise<DeliveryNote> {
    await this.prisma.$transaction(async (tx) => {
      const note = await tx.document.findFirst({
        where: { id: noteId, type: DELIVERY_NOTE },
        include: {
          deliveryNotes: {
            include: {
              salesOrder: true,
              lines: { orderBy: { position: 'asc' } },
            },
          },
          business: true,
        },
      });

      if (!note) throw notFound('Delivery Note', noteId);
      if (note.status === 'ISSUED') {
        throw conflict(
          `Delivery Note ${noteId} is already issued as ${note.number}. Issued documents are immutable.`,
          { id: noteId, number: note.number },
        );
      }
      const child = note.deliveryNotes[0]!;
      if (child.lines.length === 0) {
        throw validationFailed('A Delivery Note with no lines cannot be issued.', { id: noteId });
      }

      // Serialise concurrent issues over the same Items, so the availability reads
      // below are authoritative for the whole transaction.
      const itemIds = [...new Set(child.lines.map((line) => line.itemId))].sort();
      if (itemIds.length > 0) {
        await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM item WHERE "id" IN (${Prisma.join(itemIds)}) FOR UPDATE
        `;
      }

      const now = new Date();
      const year = now.getUTCFullYear();
      const sequence = await this.numbering.allocate(tx, DELIVERY_NOTE, year);
      const allocated = await this.numbering.render(tx, DELIVERY_NOTE, sequence, year);

      // Load the Reservations this note releases. Keyed by the order line they
      // belong to, because that is what the note lines reference.
      const orderLineIds = [
        ...new Set(
          child.lines
            .map((line) => line.salesOrderLineId)
            .filter((id): id is string => id !== null),
        ),
      ];
      const reservations = await tx.reservation.findMany({
        where: { salesOrderLineId: { in: orderLineIds } },
      });
      const reservationByLine = new Map(
        reservations.map((reservation) => [reservation.salesOrderLineId, reservation]),
      );

      for (const line of child.lines) {
        if (line.salesOrderLineId) {
          const reservation = reservationByLine.get(line.salesOrderLineId);
              invariant(
            reservation,
            `Delivery Note line ${line.id} references order line ${line.salesOrderLineId}, ` +
              'which has no Reservation; the order was never issued.',
          );
          if (reservation.releasedAt !== null) {
            throw conflict(
              `Order line ${line.salesOrderLineId} is already fully delivered and released; ` +
                'a shipped promise does not ship twice.',
              { salesOrderLineId: line.salesOrderLineId },
            );
          }
          const open = reservation.quantity.minus(reservation.deliveredQuantity);
          if (line.quantity.gt(open)) {
            throw conflict(
              `This note ships ${line.quantity.toFixed(3)} of ${line.itemId}, but only ` +
                `${open.toFixed(3)} remains open on order line ${line.salesOrderLineId}. ` +
                'Over-delivery is refused: the promise is the ceiling.',
              {
                salesOrderLineId: line.salesOrderLineId,
                itemId: line.itemId,
                requested: line.quantity.toFixed(3),
                open: open.toFixed(3),
              },
            );
          }
        }
      }

      // Goods (not services) move the ledger. The order of the loop is
      // deterministic, so the ledger's running balance reads the same across retries.
      for (const line of child.lines) {
        const item = await tx.item.findUnique({ where: { id: line.itemId } });
        invariant(item, `Item ${line.itemId} vanished while issuing ${noteId}.`);
        if (item.itemType === 'SERVICE') continue;

        await this.stock.appendEntry(tx, {
          itemId: line.itemId,
          reason: 'DELIVERY_NOTE',
          quantity: line.quantity,
          documentType: DELIVERY_NOTE,
          documentId: note.id,
          createdByUserId: actor.id ?? null,
        });
      }

      for (const line of child.lines) {
        if (!line.salesOrderLineId) continue;
        const reservation = reservationByLine.get(line.salesOrderLineId)!;
        const delivered = reservation.deliveredQuantity.plus(line.quantity);
        const releasedAt = delivered.gte(reservation.quantity) ? now : null;
        await tx.reservation.update({
          where: { id: reservation.id },
          data: { deliveredQuantity: delivered, releasedAt },
        });
      }

      await tx.document.update({
        where: { id: note.id },
        data: { status: 'ISSUED', number: allocated.number, issuedAt: now },
      });

      await this.audit.record(
        tx,
        {
          action: 'delivery-note.issued',
          entityType: DELIVERY_NOTE,
          entityId: note.id,
          before: { status: 'DRAFT', number: null },
          after: { status: 'ISSUED', number: allocated.number },
        },
        { ...actor, ipAddress: ipAddress ?? null },
      );
      return { year: now.getUTCFullYear() };
    });

    // The paper archives after the commit. The note ships stock and numbers
    // itself in one transaction; a renderer outage must not strand either, so

    const found = await this.findById(noteId);
    invariant(found, `Delivery Note ${noteId} vanished immediately after issuing.`);
    return found;
  }

  /**
   * The print copy: the paper rendered from its stored row, which the visitor's
   * browser rasterises (ADR 0010).
   */
  async readPrint(id: string): Promise<string> {
    return renderPaperHtml(await this.paperView(id));
  }

  private async paperView(noteId: string): Promise<PaperView> {
    const row = await this.prisma.document.findFirst({
      where: { id: noteId, type: DELIVERY_NOTE },
      select: { number: true, status: true, issuedAt: true, locale: true, businessId: true },
    });
    // A draft prints too, carrying its status word; only a missing row is a 404.
    if (row === null) throw notFound('Printable document', noteId);

    const found = (await this.findById(noteId)) as DeliveryNote;
    const business = await this.prisma.business.findUnique({ where: { id: row.businessId } });
    if (!business) throw notFound('Business', row.businessId);

    return deliveryNotePaperView(
      found,
      business,
      await this.unitCodes(noteId),
      paperLocale(row.locale),
    );

  }

  /** Unit codes for the note's line units, printed instead of unit ids. */
  private async unitCodes(noteId: string): Promise<UnitCodes> {
    const rows = await this.prisma.document.findFirst({
      where: { id: noteId, type: DELIVERY_NOTE },
      select: { deliveryNotes: { include: { lines: { select: { unitOfMeasureId: true } } } } },
    });
    const ids = [
      ...new Set((rows?.deliveryNotes[0]?.lines ?? []).map((line) => line.unitOfMeasureId)),
    ].filter((id) => id !== '');
    if (ids.length === 0) return new Map();
    const units = await this.prisma.unit.findMany({
      where: { id: { in: ids } },
      select: { id: true, code: true },
    });
    return new Map(units.map((unit) => [unit.id, unit.code]));
  }

  private async findOrder(id: string) {
    return this.prisma.document.findFirst({
      where: { id, type: 'SALES_ORDER' },
      include: { lines: { orderBy: { position: 'asc' } } },
    });
  }

  async findById(id: string): Promise<DeliveryNote | null> {
    const note = await this.prisma.document.findFirst({
      where: { id, type: DELIVERY_NOTE },
      include: {
        party: true,
        deliveryNotes: {
          include: {
            salesOrder: true,
            lines: { orderBy: { position: 'asc' } },
          },
        },
      },
    });

    if (!note) return null;
    return toDeliveryNote(note);
  }

  async findByRequiredId(id: string): Promise<DeliveryNote> {
    const note = await this.findById(id);
    if (!note) throw notFound('Delivery Note', id);
    return note;
  }
}

/** Map a note row (child row, linked order, lines, party) to the contract response. */
function toDeliveryNote(note: NoteWithOrderAndLines): DeliveryNote {
  const child = note.deliveryNotes[0]!;
  const order = child.salesOrder ?? null;

  return deliveryNoteSchema.parse({
    id: note.id,
    type: 'DELIVERY_NOTE',
    status: documentStatusSchema.parse(note.status),
    number: note.number,
    partyId: note.partyId,
    issuedAt: note.issuedAt?.toISOString() ?? null,
    totals: {
      netAmount: money(note.netAmount.toString()),
      taxAmount: money(note.taxAmount.toString()),
      grossAmount: money(note.grossAmount.toString()),
      withholdingTaxAmount: money(note.withholdingTaxAmount.toString()),
      stampDutyAmount: money(note.stampDutyAmount.toString()),
      // Notes are quantity documents: lines carry no money and totals stay
      // zero, so there is no FODEC to total here.
      fodecAmount: money('0.000'),
    },
    businessId: note.businessId,
    party: {
      id: note.party.id,
      code: note.party.code,
      name: note.party.name,
      address: note.party.address,
      city: note.party.city,
      countryCode: note.party.countryCode,
    },
    salesOrderId: child.salesOrderId,
    salesOrderNumber: order?.number ?? null,
    lines: child.lines.map((line) => ({
      id: line.id,
      itemId: line.itemId,
      description: line.description,
      quantity: quantity(line.quantity.toString()),
      unitOfMeasureId: line.unitOfMeasureId,
      salesOrderLineId: line.salesOrderLineId ?? null,
    })),
  });
}
