/**
 * Integration tests: a real PostgreSQL, real transactions, real locking.
 *
 * These exist because the invariants this product depends on are properties of the
 * database, not of the code. A mocked client cannot show that two concurrent
 * removals of the last administrator are prevented by a lock; only a real one can.
 *
 * `DATABASE_URL` must point at a disposable test database that already has the
 * migrations applied. There is no skip: a suite that quietly does nothing is
 * worse than no suite, and an empty green run is a lie.
 *
 * `resetDatabase()` deletes every row in every table. That makes the target of
 * this suite the single most destructive thing in the repository, so the target
 * is checked rather than trusted: a database whose name does not look disposable
 * is refused outright, whatever the environment says. See `assertDisposable`.
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../../generated/prisma/index.js';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. Integration tests need a real PostgreSQL with the ' +
      'migrations applied — start infra/compose/compose.local.yaml, or run the suite in CI.',
  );
}

/**
 * Refuses to run against anything but a disposable database.
 *
 * The suite empties every table before each test. A developer who exports their
 * development `DATABASE_URL` and types `pnpm test:integration` would otherwise
 * delete their own Business, Users and Settings, and a mistyped connection
 * string aimed at a client deployment would do the same in production. Neither
 * failure is recoverable by rerunning the suite, so the check happens before a
 * connection is opened and the error says how to fix it.
 */
function assertDisposable(connectionString: string): void {
  let databaseName: string;
  try {
    databaseName = decodeURIComponent(new URL(connectionString).pathname.replace(/^\//, ''));
  } catch {
    throw new Error(
      `DATABASE_URL is not a parseable connection string: ${connectionString}. ` +
        'Refusing to guess which database this suite would empty.',
    );
  }

  if (!/(^|[_-])test([_-]|$)/i.test(databaseName)) {
    throw new Error(
      `Refusing to run integration tests against database "${databaseName}": its name does not ` +
        'identify it as disposable. These tests delete every row in every table, so pointing ' +
        'them at a development or client database would destroy it, and no rerun brings it back. ' +
        'Use the compose test database from infra/compose/compose.local.yaml, whose name ends in ' +
        '"_test", or let CI run the suite.',
    );
  }
}

assertDisposable(DATABASE_URL);

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL, max: 20 }),
});

/** Ids in this file are generated, so tests never collide with each other's rows. */
export const uniqueEmail = (label: string): string => `${label}-${randomUUID()}@easyerp.test`;

export async function resetDatabase(): Promise<void> {
  // Children first: the foreign keys are real, and a test that disables them
  // would stop proving anything about the constraints. The order is dependency
  // order, so adding a table means adding it above its parent here — which is the
  // cheap reminder that the new table has a parent at all.
  await prisma.userRole.deleteMany();
  await prisma.authSession.deleteMany();
  await prisma.authAccount.deleteMany();
  await prisma.authUser.deleteMany();
  await prisma.role.deleteMany();
  await prisma.auditEntry.deleteMany();
  await prisma.moduleState.deleteMany();

  // Tables outside the document TRUNCATE below: the ledger's companion rows
  // (BOMs, payments) reference Item, Business and Party with RESTRICT, so they
  // are emptied explicitly and before their parents — same rule as above.
  await prisma.bomVersionLine.deleteMany();
  await prisma.bomVersion.deleteMany();
  await prisma.bom.deleteMany();
  await prisma.paymentAllocation.deleteMany();
  await prisma.payment.deleteMany();

  // Issued documents refuse DELETE in a trigger, so these tables are emptied by
  // truncating past the guard rather than row by row. `CASCADE` covers the
  // children — lines, tax groups, reservations, delivery notes — whose own
  // triggers (and foreign keys) would otherwise reject each individual delete.
  // The stock ledger and every reservation are wiped with their parents.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE reservation, stock_ledger_entry, delivery_note_line, delivery_note, ' +
      'document_tax_group, document_line, document RESTART IDENTITY CASCADE',
  );
  await prisma.business.deleteMany();

  await prisma.item.deleteMany();
  await prisma.party.deleteMany();
  await prisma.customRecord.deleteMany();
  await prisma.fieldDefinition.deleteMany();
  await prisma.numberPattern.deleteMany();
  await prisma.numberSeries.deleteMany();
  await prisma.taxRate.deleteMany();
  await prisma.label.deleteMany();
  await prisma.unit.deleteMany();
}

export async function createUser(
  overrides: { email?: string; name?: string; isActive?: boolean } = {},
): Promise<{
  id: string;
  email: string;
  name: string;
  isActive: boolean;
}> {
  return prisma.authUser.create({
    data: {
      id: randomUUID(),
      email: overrides.email ?? uniqueEmail('user'),
      name: overrides.name ?? 'Test User',
      isActive: overrides.isActive ?? true,
    },
    select: { id: true, email: true, name: true, isActive: true },
  });
}

export async function assignRole(userId: string, roleId: string): Promise<void> {
  await prisma.userRole.create({ data: { userId, roleId } });
}

/** A caller identity, as a guard would have attached it. */
export function actorFor(user: { id: string; email: string; name: string }): {
  id: string;
  email: string;
  displayName: string;
  isActive: true;
  roleIds: string[];
  permissions: string[];
} {
  return {
    id: user.id,
    email: user.email,
    displayName: user.name,
    isActive: true,
    roleIds: [],
    permissions: [],
  };
}
