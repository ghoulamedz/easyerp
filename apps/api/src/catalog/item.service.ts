/**
 * The Item catalog (spec 001 stories 25–32).
 *
 * An Item owns its prices: the server stores what the Business set, and every
 * document prices from this one record (ADR 0005). The client sets the price
 * here, at configuration time — the prohibition that matters is on *document*
 * lines, where `orderLineInputSchema` is a strictObject and a request carrying a
 * unit price is rejected outright.
 *
 * Items are retired, never deleted (story 27). A document that already quotes an
 * Item keeps its stored description even after the Item is deactivated; a
 * deactivated Item cannot appear on a new document, which `priceItems` in the
 * invoice service enforces. There is deliberately no DELETE route: `item:delete`
 * exists in the permission catalog and this surface does not use it, exactly as
 * with the Customer Invoice.
 *
 * Search (story 32) is a `contains` predicate across code, name and description,
 * served by the trigram GIN indexes the migration created — a btree could not
 * answer an `ilike '%…%'` and the plan would be a scan of the whole catalog.
 */

import { Injectable } from '@nestjs/common';

import {
  itemInputSchema,
  itemSchema,
  pageQuerySchema,
  type Item,
  type PageQuery,
} from '@easyerp/contracts';

import { AuditService } from '../audit/audit.service.js';
import { conflict, notFound, validationFailed } from '../common/errors.js';
import { Prisma } from '../generated/prisma/index.js';
import { PrismaService } from '../prisma/prisma.service.js';

const ITEM_ENTITY = 'ITEM';

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

function uniqueConflict(entity: string, field: string): never {
  throw conflict(`${entity} with that ${field} already exists`, { field });
}

function isUniqueViolation(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** The schema-shaped read record for a Prisma row of decimals. */
function toRecord(row: {
  id: string;
  code: string;
  name: string;
  description: string | null;
  itemType: string;
  baseUnitId: string;
  purchaseUnitId: string | null;
  saleUnitId: string | null;
  taxRateId: string;
  fodecSubject: boolean;
  salePrice: { toFixed(digits: number): string };
  purchasePrice: { toFixed(digits: number): string };
  reorderPoint: { toFixed(digits: number): string } | null;
  isActive: boolean;
  customFields: Prisma.JsonValue;
}): Item {
  return itemSchema.parse({
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    itemType: row.itemType,
    baseUnitId: row.baseUnitId,
    purchaseUnitId: row.purchaseUnitId,
    saleUnitId: row.saleUnitId,
    taxRateId: row.taxRateId,
    fodecSubject: row.fodecSubject,
    salePrice: row.salePrice.toFixed(3),
    purchasePrice: row.purchasePrice.toFixed(3),
    reorderPoint: row.reorderPoint?.toFixed(3) ?? null,
    /* Derived: the column does not exist, `SERVICE` is a type not a flag twice. */
    isService: row.itemType === 'SERVICE',
    isActive: row.isActive,
    customFields: row.customFields,
  });
}

@Injectable()
export class ItemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    input: unknown,
    actor: { id: string; email: string },
    ipAddress?: string | null,
  ): Promise<Item> {
    const parsed = itemInputSchema.parse(input);
    await this.assertReferences(
      parsed.baseUnitId,
      parsed.purchaseUnitId,
      parsed.saleUnitId,
      parsed.taxRateId,
    );

    try {
      const row = await this.prisma.item.create({
        data: {
          code: parsed.code,
          name: parsed.name,
          description: parsed.description,
          itemType: parsed.itemType,
          baseUnitId: parsed.baseUnitId,
          purchaseUnitId: parsed.purchaseUnitId,
          saleUnitId: parsed.saleUnitId,
          taxRateId: parsed.taxRateId,
          fodecSubject: parsed.fodecSubject,
          salePrice: parsed.salePrice,
          purchasePrice: parsed.purchasePrice,
          reorderPoint: parsed.reorderPoint,
          isActive: parsed.isActive,
          customFields: (parsed.customFields ?? {}) as Prisma.InputJsonValue,
        },
      });
      const record = toRecord(row);
      await this.audit.record(
        this.prisma,
        { action: 'item.created', entityType: ITEM_ENTITY, entityId: row.id, after: record },
        { ...actor, ipAddress: ipAddress ?? null },
      );
      return record;
    } catch (error) {
      if (isUniqueViolation(error)) uniqueConflict('Item', 'code');
      throw error;
    }
  }

  /** The paged, searchable catalog (Q10, story 32). */
  async list(query: unknown): Promise<Paged<Item>> {
    const parsed = pageQuerySchema.parse(query);
    const where = this.searchWhere(parsed);
    const [rows, total] = await Promise.all([
      this.prisma.item.findMany({
        where,
        orderBy: { code: 'asc' },
        skip: (parsed.page - 1) * parsed.pageSize,
        take: parsed.pageSize,
      }),
      this.prisma.item.count({ where }),
    ]);
    return {
      items: rows.map(toRecord),
      total,
      page: parsed.page,
      pageSize: parsed.pageSize,
    };
  }

  async findById(id: string): Promise<Item | null> {
    const row = await this.prisma.item.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  }

  /**
   * Edit an Item, or retire it by setting `isActive: false`. A deactivated Item
   * keeps its row: documents that quote it already did, and history is not erased.
   */
  async update(
    id: string,
    input: unknown,
    actor: { id: string; email: string },
    ipAddress?: string | null,
  ): Promise<Item> {
    const before = await this.prisma.item.findUnique({ where: { id } });
    if (!before) throw notFound('Item', id);

    const patch = itemInputSchema.partial().parse(input);
    await this.assertReferences(
      patch.baseUnitId ?? before.baseUnitId,
      patch.purchaseUnitId === undefined ? before.purchaseUnitId : patch.purchaseUnitId,
      patch.saleUnitId === undefined ? before.saleUnitId : patch.saleUnitId,
      patch.taxRateId ?? before.taxRateId,
    );

    try {
      const row = await this.prisma.item.update({
        where: { id },
        data: {
          ...(patch.code !== undefined && { code: patch.code }),
          ...(patch.name !== undefined && { name: patch.name }),
          ...(patch.description !== undefined && { description: patch.description }),
          ...(patch.itemType !== undefined &&
            patch.itemType !== before.itemType && { itemType: patch.itemType }),
          ...(patch.baseUnitId !== undefined && { baseUnitId: patch.baseUnitId }),
          ...(patch.purchaseUnitId !== undefined && { purchaseUnitId: patch.purchaseUnitId }),
          ...(patch.saleUnitId !== undefined && { saleUnitId: patch.saleUnitId }),
          ...(patch.taxRateId !== undefined && { taxRateId: patch.taxRateId }),
          ...(patch.fodecSubject !== undefined && { fodecSubject: patch.fodecSubject }),
          ...(patch.salePrice !== undefined && { salePrice: patch.salePrice }),
          ...(patch.purchasePrice !== undefined && { purchasePrice: patch.purchasePrice }),
          ...(patch.reorderPoint !== undefined && { reorderPoint: patch.reorderPoint }),
          ...(patch.isActive !== undefined && { isActive: patch.isActive }),
          ...(patch.customFields !== undefined && {
            customFields: patch.customFields as Prisma.InputJsonValue,
          }),
        },
      });
      const record = toRecord(row);
      await this.audit.record(
        this.prisma,
        {
          action: 'item.updated',
          entityType: ITEM_ENTITY,
          entityId: row.id,
          before: toRecord(before),
          after: record,
        },
        { ...actor, ipAddress: ipAddress ?? null },
      );
      return record;
    } catch (error) {
      if (isUniqueViolation(error)) uniqueConflict('Item', 'code');
      throw error;
    }
  }

  /** Resolve every referenced master row before writing (stories 25, 27, 31). */
  private async assertReferences(
    baseUnitId: string,
    purchaseUnitId: string | null | undefined,
    saleUnitId: string | null | undefined,
    taxRateId: string,
  ): Promise<void> {
    const [units, rate] = await Promise.all([
      this.prisma.unit.findMany({
        where: {
          id: {
            in: [
              ...new Set(
                [baseUnitId, purchaseUnitId, saleUnitId].filter((id): id is string => Boolean(id)),
              ),
            ],
          },
        },
      }),
      this.prisma.taxRate.findUnique({ where: { id: taxRateId } }),
    ]);
    const unitIds = new Set(units.map((unit) => unit.id));
    if (!unitIds.has(baseUnitId))
      throw validationFailed('The base unit does not exist', { baseUnitId });
    if (purchaseUnitId && !unitIds.has(purchaseUnitId)) {
      throw validationFailed('The purchase unit does not exist', { purchaseUnitId });
    }
    if (saleUnitId && !unitIds.has(saleUnitId)) {
      throw validationFailed('The sale unit does not exist', { saleUnitId });
    }
    if (!rate) throw validationFailed('The tax rate does not exist', { taxRateId });
    if (!rate.isActive) {
      throw validationFailed('A retired tax rate cannot be applied to a new Item', { taxRateId });
    }
  }

  private searchWhere(query: PageQuery): Record<string, unknown> {
    if (!query.q) return {};
    return {
      OR: [
        { code: { contains: query.q, mode: 'insensitive' } },
        { name: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
      ],
    };
  }
}
