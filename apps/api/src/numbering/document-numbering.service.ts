/**
 * Document numbering (ADR 0006).
 *
 * A number is assigned at issue and never before, and the series has no gaps. Gaps
 * are a legal problem in Tunisia, not a cosmetic one, so the allocation is a single
 * statement and the guarantee does not depend on application code being careful:
 *
 * ```sql
 * UPDATE number_series SET next_value = next_value + 1
 *  WHERE code = $1 AND year = $2 RETURNING next_value - 1
 * ```
 *
 * One `UPDATE … RETURNING` yields the value and takes the row lock, so two
 * concurrent issues of the same Document type in the same year receive different
 * numbers. `SELECT` then `UPDATE` would not: both transactions would read the same
 * value.
 *
 * Every method takes the caller's Prisma client rather than reaching for a
 * singleton. The number and the document it belongs to are one fact; allocating on
 * a different connection than the one that writes the document is precisely how a
 * number ends up committed for a row that was rolled back.
 */

import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  numberPatternSchema,
  renderDocumentNumber,
  type DocumentType,
  type NumberPattern,
} from '@easyerp/contracts';

import { PrismaService } from '../prisma/prisma.service.js';

export class NumberingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NumberingError';
  }
}

/**
 * The numbering defaults every Business type gets, used when a Business has not
 * defined its own pattern for a Document type. Reality diverged from the
 * original three-type default as new Document types landed, so all seven live
 * here, one source, and Setup writes the same set into the database at
 * provisioning (spec 001 story 7), where Settings edits them afterwards.
 */
export const DEFAULT_PATTERNS: Readonly<Record<DocumentType, string>> = {
  SALES_ORDER: 'BC-{year}-{seq}',
  DELIVERY_NOTE: 'BL-{year}-{seq}',
  CUSTOMER_INVOICE: 'FA-{year}-{seq}',
  CREDIT_NOTE: 'AV-{year}-{seq}',
  PURCHASE_ORDER: 'BCA-{year}-{seq}',
  GOODS_RECEIPT: 'BR-{year}-{seq}',
  PRODUCTION_ORDER: 'OF-{year}-{seq}',
};

/** The subset of the Prisma client these methods need, so a transaction works. */
export type NumberingClient = Pick<PrismaService, 'numberPattern' | '$queryRaw' | '$executeRawUnsafe'>;

export interface AllocatedNumber {
  readonly number: string;
  readonly sequence: number;
  readonly pattern: string;
  readonly padding: number;
}

@Injectable()
export class DocumentNumberingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Allocate the next sequence for a Document type and year. Call inside a transaction. */
  async allocate(client: NumberingClient, code: string, year: number): Promise<number> {
    // No `SELECT ... FOR UPDATE` here: the single `INSERT ... ON CONFLICT DO
    // UPDATE` below is the whole guarantee, and a locking read in front of it
    // serialises nothing (it locks no row when the series year is new) while
    // adding a deadlock edge under concurrency.
    // One statement, so the allocation is atomic and the row cannot be created twice.
    //
    // An `upsert` was the obvious spelling and it is wrong here: Prisma's upsert is a
    // read followed by a write, so two transactions drafting their first document of
    // the year both read "absent" and both insert, and one dies on the unique
    // constraint. That is not a retryable error — it surfaces as a failed invoice.
    //
    // `ON CONFLICT DO UPDATE` resolves the race inside PostgreSQL: whichever
    // transaction arrives first inserts, the other waits for it and then increments.
    // The insert path stores 2 so that both branches return the same "value before this
    // allocation", which is what makes the returned sequence gapless.
    const rows = await client.$queryRaw<{ value: number }[]>`
      INSERT INTO number_series (id, code, year, "nextValue", "updatedAt")
      VALUES (${randomUUID()}, ${code}, ${year}, 2, now())
      ON CONFLICT (code, year)
      DO UPDATE SET "nextValue" = number_series."nextValue" + 1, "updatedAt" = now()
      RETURNING "nextValue" - 1 AS value
    `;

    const allocated = rows[0]?.value;
    if (allocated === undefined) {
      throw new NumberingError(`Could not allocate a number for ${code} / ${year}.`);
    }

    if (!Number.isSafeInteger(allocated) || allocated < 1) {
      throw new NumberingError(
        `Number series ${code} / ${year} produced an unusable sequence: ${String(allocated)}.`,
      );
    }

    return allocated;
  }

  /** Render an allocated sequence with the Business's pattern for that Document type. */
  async render(
    client: NumberingClient,
    code: string,
    sequence: number,
    year: number,
  ): Promise<AllocatedNumber> {
    // No row lock: rendering only reads the pattern, and a locking read would
    // serialise every concurrent issue of this Document type for no benefit.
    const stored = await client.numberPattern.findUnique({ where: { code } });
    const raw = stored?.pattern ?? (DEFAULT_PATTERNS as Readonly<Record<string, string>>)[code];

    if (raw === undefined) {
      throw new NumberingError(
        `No numbering pattern for "${code}". Add a number_pattern row, or a default for the type.`,
      );
    }

    const pattern: NumberPattern = numberPatternSchema.parse(raw);
    const padding = stored?.padding ?? 4;

    if (!Number.isSafeInteger(padding) || padding < 1) {
      throw new NumberingError(
        `Number pattern "${code}" has an unusable padding of ${padding}. It must be a positive integer.`,
      );
    }

    return {
      number: renderDocumentNumber(pattern, { sequence, year, padding }),
      sequence,
      pattern,
      padding,
    };
  }

  /** The default client, for callers outside a transaction. */
  get client(): NumberingClient {
    return this.prisma;
  }
}
