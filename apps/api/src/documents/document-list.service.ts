/**
 * Document lists, one service with a type parameter (ADR 0014).
 */

import { Injectable } from '@nestjs/common';

import {
  documentListQuerySchema,
  money,
  type DocumentSummary,
  type DocumentType,
} from '@easyerp/contracts';

import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/index.js';

export interface DocumentPage {
  readonly items: readonly DocumentSummary[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

@Injectable()
export class DocumentListService {
  constructor(private readonly prisma: PrismaService) {}

  async list(type: DocumentType, query: unknown): Promise<DocumentPage> {
    const parsed = documentListQuerySchema.parse(query);

    const where = {
      type: type as string,
      ...(parsed.status ? { status: parsed.status } : {}),
      ...(parsed.q ? { number: { contains: parsed.q, mode: 'insensitive' as const } } : {}),
    };

    // The count and the page are independent reads of the same filter, so they go at
    // once: awaiting them in sequence cost two round trips on every list screen, and
    // on a remote database the round trip *is* the cost.
    const [total, documents] = await Promise.all([
      this.prisma.document.count({ where }),
      this.prisma.document.findMany({
        where,
        select: {
          id: true,
          type: true,
          status: true,
          number: true,
          partyId: true,
          party: {
            select: { name: true },
          },
          issuedAt: true,
          grossAmount: true,
          currency: true,
        },
        orderBy: { createdAt: 'desc' },
        // 1-indexed page: skip the previous pages' worth of rows.
        skip: (parsed.page - 1) * parsed.pageSize,
        take: parsed.pageSize,
      }),
    ]);

    // Now lock those specific rows to prevent stale reads from concurrent mutations.
    const ids: string[] = documents.map((d) => d.id);
    if (ids.length > 0) {
      await this.prisma.$queryRaw`SELECT id FROM "document" WHERE id IN (${Prisma.join(
        ids,
      )}) FOR UPDATE`;
    }

    // documents is never null, it's an empty array at minimum

    return {
      items: documents.map((d) => ({
        id: d.id,
        type: d.type as DocumentType,
        status: d.status as DocumentSummary['status'],
        number: d.number,
        partyId: d.partyId,
        partyName: d.party.name ?? null,
        issuedAt: d.issuedAt?.toISOString() ?? null,
        grossAmount: money(d.grossAmount.toString()),
        currency: d.currency,
      })),
      total,
      page: parsed.page,
      pageSize: parsed.pageSize,
    };
  }

  async find(id: string, type: DocumentType): Promise<DocumentSummary | null> {
    // Lock the document row to prevent stale reads from concurrent mutations.
    await this.prisma
      .$queryRaw`SELECT 1 FROM "document" WHERE id = ${id} AND type = ${type} FOR UPDATE`;

    const document = await this.prisma.document.findUnique({
      where: { id },
      include: {
        party: {
          select: { name: true },
        },
      },
    });

    if (!document) return null;

    return {
      id: document.id,
      type: document.type as DocumentType,
      status: document.status as DocumentSummary['status'],
      number: document.number,
      partyId: document.partyId,
      partyName: document.party?.name ?? null,
      issuedAt: document.issuedAt?.toISOString() ?? null,
      grossAmount: money(document.grossAmount.toString()),
      currency: document.currency,
    };
  }
}
