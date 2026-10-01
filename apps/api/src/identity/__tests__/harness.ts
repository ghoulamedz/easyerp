/**
 * Integration tests: a real PostgreSQL, real transactions, real locking.
 *
 * These exist because the invariants this product depends on are properties of the
 * database, not of the code. A mocked client cannot show that two concurrent
 * removals of the last administrator are prevented by a lock; only a real one can.
 *
 * `DATABASE_URL` must point at a database that already has the migrations applied.
 * There is no skip: a suite that quietly does nothing is worse than no suite, and
 * an empty green run is a lie.
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../../generated/prisma/index.js';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. Integration tests need a real PostgreSQL with the ' +
      'migrations applied — start infra/compose/compose.test.yaml, or run the suite in CI.',
  );
}

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL, max: 20 }),
});

/** Ids in this file are generated, so tests never collide with each other's rows. */
export const uniqueEmail = (label: string): string => `${label}-${randomUUID()}@easyerp.test`;

export async function resetDatabase(): Promise<void> {
  // Children first: the foreign keys are real, and a test that disables them
  // would stop proving anything about the constraints.
  await prisma.userRole.deleteMany();
  await prisma.authSession.deleteMany();
  await prisma.authAccount.deleteMany();
  await prisma.authUser.deleteMany();
  await prisma.role.deleteMany();
  await prisma.auditEntry.deleteMany();
  await prisma.business.deleteMany();
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
