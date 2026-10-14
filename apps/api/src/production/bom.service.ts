/**
 * Bill of Materials service (spec 002 stories 85–86).
 *
 * A BOM names the component Items and their quantities for one unit of a
 * finished Item. A version is immutable and dated; a Production Order holds a
 * `bomVersionId` and never joins to "the latest".
 */

import { Injectable } from '@nestjs/common';

import {
  bomListQuerySchema,
  bomSummarySchema,
  createBomSchema,
  createBomVersionSchema,
  quantity,
  type Bom as BomResponse,
  type BomSummary,
  type BomVersion as BomVersionResponse,
} from '@easyerp/contracts';

import { notFound, validationFailed } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class BomService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new BOM for a finished Item.
   */
  async create(
    payload: unknown,
  ): Promise<BomResponse> {
    const input = createBomSchema.parse(payload);

    const finishedItem = await this.prisma.item.findUnique({
      where: { id: input.finishedItemId },
    });
    if (!finishedItem) throw notFound('Item', input.finishedItemId);

    const existing = await this.prisma.bom.findUnique({
      where: { finishedItemId: input.finishedItemId },
    });
    if (existing) {
      throw validationFailed('A BOM for this finished Item already exists.', {
        finishedItemId: input.finishedItemId,
      });
    }

    const bom = await this.prisma.bom.create({
      data: {
        finishedItemId: input.finishedItemId,
      },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          include: { lines: { orderBy: { position: 'asc' } } },
        },
      },
    });

    return this.toResponse(bom);
  }

  /**
   * Create a new version of a BOM.
   */
  async createVersion(
    payload: unknown,
  ): Promise<BomVersionResponse> {
    const input = createBomVersionSchema.parse(payload);

    const bom = await this.prisma.bom.findUnique({
      where: { id: input.bomId },
    });
    if (!bom) throw notFound('BOM', input.bomId);

    const lastVersion = await this.prisma.bomVersion.findFirst({
      where: { bomId: input.bomId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (lastVersion?.version ?? 0) + 1;

    const version = await this.prisma.bomVersion.create({
      data: {
        bomId: input.bomId,
        version: nextVersion,
        lines: {
          create: input.lines.map((line, position) => ({
            position,
            itemId: line.itemId,
            quantity: line.quantity,
            unitOfMeasureId: line.unitOfMeasureId,
          })),
        },
      },
      include: { lines: { orderBy: { position: 'asc' } } },
    });

    return this.toVersionResponse(version);
  }

  /**
   * List BOMs, newest first, as summaries: finished-item identity plus the
   * version signal a list screen needs. Lines stay on the detail route.
   */
  async list(query: unknown): Promise<{ items: BomSummary[]; total: number; page: number; pageSize: number }> {
    const parsed = bomListQuerySchema.parse(query);
    const where: Record<string, unknown> = {};
    if (parsed.q) {
      where.OR = [
        { finishedItem: { code: { contains: parsed.q, mode: 'insensitive' } } },
        { finishedItem: { name: { contains: parsed.q, mode: 'insensitive' } } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.bom.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          finishedItem: { select: { code: true, name: true } },
          versions: { select: { version: true }, orderBy: { version: 'desc' } },
        },
        skip: (parsed.page - 1) * parsed.pageSize,
        take: parsed.pageSize,
      }),
      this.prisma.bom.count({ where }),
    ]);
    return {
      items: rows.map((row) =>
        bomSummarySchema.parse({
          id: row.id,
          finishedItemId: row.finishedItemId,
          finishedItemCode: row.finishedItem.code,
          finishedItemName: row.finishedItem.name,
          versionCount: row.versions.length,
          latestVersion: row.versions[0]?.version ?? null,
          createdAt: row.createdAt.toISOString(),
        }),
      ),
      total,
      page: parsed.page,
      pageSize: parsed.pageSize,
    };
  }

  /**
   * Find a BOM by finished Item ID.
   */
  async findByFinishedItem(finishedItemId: string): Promise<BomResponse | null> {
    const bom = await this.prisma.bom.findUnique({
      where: { finishedItemId },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          include: { lines: { orderBy: { position: 'asc' } } },
        },
      },
    });

    if (!bom) return null;
    return this.toResponse(bom);
  }

  /**
   * Find a BOM by ID.
   */
  async findById(id: string): Promise<BomResponse | null> {
    const bom = await this.prisma.bom.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          include: { lines: { orderBy: { position: 'asc' } } },
        },
      },
    });

    if (!bom) return null;
    return this.toResponse(bom);
  }

  /**
   * Find a BOM version by ID.
   */
  async findVersionById(id: string): Promise<BomVersionResponse | null> {
    const version = await this.prisma.bomVersion.findUnique({
      where: { id },
      include: { lines: { orderBy: { position: 'asc' } } },
    });

    if (!version) return null;
    return this.toVersionResponse(version);
  }

  private toResponse(bom: {
    id: string;
    finishedItemId: string;
    createdAt: Date;
    updatedAt: Date;
    versions: Array<{
      id: string;
      version: number;
      createdAt: Date;
      lines: Array<{
        itemId: string;
        quantity: { toString(): string };
        unitOfMeasureId: string;
      }>;
    }>;
  }): BomResponse {
    return {
      id: bom.id,
      finishedItemId: bom.finishedItemId,
      createdAt: bom.createdAt.toISOString(),
      versions: bom.versions.map((v) => this.toVersionResponse(v)),
    };
  }

  private toVersionResponse(version: {
    id: string;
    version: number;
    createdAt: Date;
    lines: Array<{
      itemId: string;
      quantity: { toString(): string };
      unitOfMeasureId: string;
    }>;
  }): BomVersionResponse {
    return {
      id: version.id,
      version: version.version,
      createdAt: version.createdAt.toISOString(),
      lines: version.lines.map((line) => ({
        itemId: line.itemId,
        quantity: quantity(line.quantity.toString()),
        unitOfMeasureId: line.unitOfMeasureId,
      })),
    };
  }
}