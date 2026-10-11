/**
 * The restore drill's table list, checked against the schema it is meant to
 * restore.
 *
 * This test exists because the list was once wrong in the worst possible way: it
 * held Prisma model names (`AuthUser`) that no table has ever had, plus four
 * tables (`Item`, `Party`, `StockMovement`, `Document`) that do not exist yet.
 * A drill that can only fail is a drill nobody runs, so a check that can only
 * fail is a check that has never been run. Both facts are asserted here.
 *
 * The schema is read as text rather than imported, because Prisma generates its
 * client and this assertion is precisely about whether that generation is in
 * agreement with a hand-written list.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CRITICAL_TABLES, MUST_HAVE_ROWS } from './tables.js';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA = resolve(here, '..', '..', 'apps', 'api', 'prisma', 'schema.prisma');
const schema = readFileSync(SCHEMA, 'utf8');

/** Every `@@map("...")` in the schema: the names the database really uses. */
const mapped: readonly string[] = [...schema.matchAll(/@@map\("([^"]+)"\)/g)].map(
  (match) => match[1] as string,
);

/** Every `model Name {`: what Prisma calls a table. */
const models: readonly string[] = [...schema.matchAll(/^model (\w+)/gm)].map(
  (match) => match[1] as string,
);

describe('restore drill table list', () => {
  it('names only tables the schema actually maps', () => {
    // The failure this prevents: a name that no migration has ever created.
    const invented = CRITICAL_TABLES.filter((table) => !mapped.includes(table));
    expect(invented).toEqual([]);
  });

  it('does not use Prisma model names, which are not table names', () => {
    const upper = new Set(models);
    const used = CRITICAL_TABLES.filter((table) => upper.has(table));
    expect(used).toEqual([]);
  });

  it('reads as database identifiers, not JavaScript identifiers', () => {
    const notSnake = CRITICAL_TABLES.filter((table) => !/^[a-z][a-z0-9_]*$/.test(table));
    expect(notSnake).toEqual([]);
  });

  it('has no duplicates, because a duplicate hides a missing table', () => {
    expect(new Set(CRITICAL_TABLES).size).toBe(CRITICAL_TABLES.length);
  });

  it('covers every table the schema maps except the Prisma internals', () => {
    // Prisma's own migration bookkeeping is checked separately, and it is not a
    // Business table. Everything else that exists today must be in the list, or
    // the drill cannot detect a dump that lost it.
    const prismaInternals = new Set(['_prisma_migrations']);
    const expected = mapped.filter((table) => !prismaInternals.has(table)).sort();
    expect([...CRITICAL_TABLES].sort()).toEqual(expected);
  });

  it('only requires rows for tables it already requires to exist', () => {
    // A table named in MUST_HAVE_ROWS but missing from CRITICAL_TABLES would be
    // counted without first being proven present, so its emptiness would be
    // reported as "came back empty" rather than "missing".
    const orphaned = MUST_HAVE_ROWS.filter((table) => !CRITICAL_TABLES.includes(table));
    expect(orphaned).toEqual([]);
  });

  it('requires rows only where a deployed instance cannot be empty', () => {
    // Every table here must be one that first-run Setup fills before the API
    // serves anything. `auth_session`, `label`, `custom_record` and
    // `field_definition` are empty on a healthy fresh install, so asserting rows
    // in them would make every drill fail — the defect this file exists to stop.
    expect([...MUST_HAVE_ROWS]).toEqual(['business']);
  });
});
