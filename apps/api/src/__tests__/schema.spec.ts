/**
 * Schema promises the data model makes to itself, checked against a real
 * database rather than against `schema.prisma`.
 *
 * A Prisma schema is a description; a migration is a fact. The two drift, and
 * nothing in the TypeScript toolchain notices when they do — a column the schema
 * documents but no migration creates is invisible until a query fails in
 * production. So the promises that live only in prose are asserted here.
 *
 * Both promises were broken when this file was written: `business` had no
 * `vatRegime`, `currency` or `provisionedVersion`, and `custom_record` had no
 * index on its payload despite a comment in the schema claiming one existed.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { prisma, resetDatabase } from '../identity/__tests__/harness.js';

afterAll(async () => {
  await prisma.$disconnect();
});

/** A Business with only the columns that have always been required. */
async function createMinimalBusiness() {
  return prisma.business.create({
    data: {
      legalName: 'Société Générale de Test',
      displayName: 'Test',
      taxIdentifier: '1234567/A/M/000',
      countryCode: 'TN',
    },
  });
}

describe('Business settings', () => {
  it('carries the VAT regime, the currency and the provisioned version', async () => {
    await resetDatabase();

    const business = await createMinimalBusiness();

    expect(business.vatRegime).toBe('STANDARD');
    expect(business.currency).toBe('TND');
    expect(business.provisionedVersion).toBe(1);
  });

  it('defaults to a regime and a currency, so no release ever adds a required Setting with no default', async () => {
    await resetDatabase();

    // The value is read back from the column rather than from the schema, because
    // ADR 0012's rule is about what a Business that already exists receives. The
    // default has to live in the database: a client set up before this release
    // never ran the code that would have supplied it.
    await createMinimalBusiness();
    const rows = await prisma.$queryRaw<{ vatRegime: string; currency: string }[]>`
      SELECT "vatRegime", "currency" FROM "business" LIMIT 1
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.vatRegime).toBe('STANDARD');
    expect(rows[0]!.currency).toBe('TND');

    const defaults = await prisma.$queryRaw<
      { column_name: string; column_default: string | null; is_nullable: string }[]
    >`
      SELECT column_name, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'business'
        AND column_name IN ('vatRegime', 'currency', 'provisionedVersion')
    `;

    // NOT NULL, because spec 001 rejects nullable Settings with null branches at
    // every use: the type stops telling the truth where money and legal
    // particulars are exactly what the database should refuse.
    expect(defaults.map((column) => column.column_name).sort()).toEqual([
      'currency',
      'provisionedVersion',
      'vatRegime',
    ]);
    for (const column of defaults) {
      expect(column.is_nullable, column.column_name).toBe('NO');
      expect(column.column_default, column.column_name).not.toBeNull();
    }
  });
});

describe('custom_record payload index', () => {
  it('is a GIN index over the payload, which a containment filter needs', async () => {
    await resetDatabase();

    const indexes = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'custom_record'
    `;
    const gin = indexes.find((index) => index.indexname === 'custom_record_values_gin_idx');

    expect(
      gin,
      `no custom_record_values_gin_idx among ${indexes.map((i) => i.indexname).join(', ')}`,
    ).toBeDefined();
    expect(gin!.indexdef).toContain('USING gin');
    expect(gin!.indexdef).toContain('values');
  });

  it('is the index the planner reaches for when filtering a Custom Record by a Custom Field', async () => {
    await resetDatabase();

    // `enable_seqscan = off` makes the planner unable to fall back on a full
    // scan, so this asserts the index can serve the query rather than that the
    // table happens to be big enough for the planner to prefer it. A Business
    // with three Custom Records would otherwise be filtered by a sequential scan
    // whether or not the index existed — the exact silent full table scan ADR
    // 0008 says the index exists to prevent.
    const plan = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');
      return tx.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(
        `EXPLAIN (COSTS OFF) SELECT id FROM "custom_record" WHERE "values" @> '{"colour":"red"}'::jsonb`,
      );
    });

    const rendered = plan.map((line) => line['QUERY PLAN']).join('\n');
    expect(rendered).toContain('custom_record_values_gin_idx');
  });
});
