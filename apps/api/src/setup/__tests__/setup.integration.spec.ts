/**
 * First-run Setup, end to end (ADR 0012).
 *
 * The interesting properties of Setup are properties of a real deployment, not
 * of a service in isolation: a second visitor is refused by a count that was
 * committed minutes ago; two simultaneous visitors produce exactly one Business
 * because of a transaction lock; a request that fails partway leaves nothing
 * behind; and the credentials it creates answer the *real* sign-in route served
 * by Better Auth over the API's own HTTP stack. Each of those is an assertion
 * here against a real AppModule, real PostgreSQL and the real `/api/auth`
 * handler.
 */

import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DomainExceptionFilter } from '../../common/domain-exception.filter.js';
import { env, loadEnv } from '../../config/env.js';
import { getAuth } from '../../identity/auth/better-auth.provider.js';
import { RolesService } from '../../identity/roles.service.js';
import { prisma, resetDatabase } from '../../identity/__tests__/harness.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function request(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    token: env().FIRST_SETUP_TOKEN,
    business: {
      legalName: 'Société Générale d’Édition',
      displayName: 'SGE',
      taxIdentifier: '1204697/A/M/000',
      countryCode: 'TN',
      vatRegime: 'STANDARD',
      currency: 'TND',
    },
    administrator: {
      email: `setup-${randomUUID()}@easyerp.test`,
      name: 'Firmin Testateur',
      password: 'correct horse battery staple',
    },
    units: [{ code: 'PCS', allowsFraction: false }],
    taxRates: [{ code: 'STANDARD_19', rate: '19' }],
    ...overrides,
  };
}

describe('Setup (ADR 0012)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    loadEnv();
    // main.ts runs with `bodyParser: false`, mounts Better Auth's handler before
    // any body parser (it parses its own requests), then installs express.json
    // for everything else and the filter that maps DomainError to its HTTP
    // status. Booting AppModule directly (as app.module.spec does) skips all of
    // that: an unmounted auth route 404s, and an unmounted filter turns every
    // rule violation into a 500. Repeating main.ts's wiring is what makes these
    // end-to-end claims against the real module graph real.
    const server = express();
    app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
      logger: false,
      bodyParser: false,
    });
    const auth = await getAuth(app.get(PrismaService));
    server.use('/api/auth', auth.nodeHandler);
    app.use(express.json({ limit: '1mb' }));
    app.useGlobalFilters(new DomainExceptionFilter());
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  beforeEach(async () => {
    await resetDatabase();
    // The suite empties the role table between tests; boot already repaired the
    // Administrator role once, so re-run the same repair a test would face after
    // an actual restart. The assertion "Setup works on a fresh deployment"
    // depends on the boot repair being real, which app.module.spec pins.
    await app.get(RolesService).ensureAdministrator();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('reports needsSetup from a real count', async () => {
    const response = await fetch(`${baseUrl}/api/setup/status`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ needsSetup: true });
  });

  it('refuses a request that does not carry the correct token, and leaves nothing behind', async () => {
    const response = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request({ token: 'an-entirely-wrong-token' })),
    });
    expect(response.status).toBe(403);
    await expect(prisma.business.count()).resolves.toBe(0);
    await expect(prisma.authUser.count()).resolves.toBe(0);
  });

  it('creates the Business, Units, Tax Rates, number patterns, Administrator and audit trail in one call', async () => {
    const adminEmail = `setup-${randomUUID()}@easyerp.test`;
    const response = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request({ administrator: { ...safeAdmin(adminEmail) } })),
    });
    expect(response.status).toBe(201);
    const result = (await response.json()) as { businessId: string; administratorEmail: string };
    expect(result.administratorEmail).toBe(adminEmail);

    const business = await prisma.business.findUnique({ where: { id: result.businessId } });
    expect(business?.legalName).toBe('Société Générale d’Édition');
    expect(business?.vatRegime).toBe('STANDARD');
    expect(business?.currency).toBe('TND');

    await expect(prisma.unit.count()).resolves.toBe(1);
    await expect(prisma.taxRate.count()).resolves.toBe(1);
    await expect(prisma.numberPattern.count()).resolves.toBe(7);

    const administrator = await prisma.authUser.findUnique({ where: { email: adminEmail } });
    expect(administrator).not.toBeNull();
    expect(administrator?.emailVerified).toBe(true);

    const credential = await prisma.authAccount.findFirst({
      where: { userId: administrator?.id, providerId: 'credential' },
    });
    expect(credential).not.toBeNull();
    expect(credential?.password?.length ?? 0).toBeGreaterThan(20);

    const assignment = await prisma.userRole.findFirst({ where: { userId: administrator?.id } });
    const role = assignment && (await prisma.role.findUnique({ where: { id: assignment.roleId } }));
    expect(role?.code).toBe('ADMINISTRATOR');

    const audit = await prisma.auditEntry.findMany({ where: { entityType: 'SETUP' } });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.actorId).toBeNull();
    expect(audit[0]?.actorEmail).toBeNull();
    if (audit[0]?.after) {
      const after = audit[0].after as { businessId?: string };
      expect(after.businessId).toBe(result.businessId);
    }
  });

  it('signs the created Administrator in through the real /api/auth route', async () => {
    const adminEmail = `setup-${randomUUID()}@easyerp.test`;
    const setup = request({ administrator: { ...safeAdmin(adminEmail) } });
    const complete = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(setup),
    });
    expect(complete.status).toBe(201);

    const signIn = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: safeAdmin(adminEmail).password }),
    });
    expect(signIn.status).toBe(200);
    const body = (await signIn.json()) as { user?: { email?: string } };
    expect(body.user?.email).toBe(adminEmail);
  });

  it('marks Setup complete and then refuses the same request again with 404', async () => {
    const payload = request();
    const first = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(first.status).toBe(201);

    const status = await fetch(`${baseUrl}/api/setup/status`);
    await expect(status.json()).resolves.toEqual({ needsSetup: false });

    const second = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(second.status).toBe(404);
    await expect(prisma.business.count()).resolves.toBe(1);
  });

  it('refuses a STANDARD Business without any Tax Rate', async () => {
    const response = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request({ taxRates: [] })),
    });
    expect(response.status).toBe(422);
    await expect(prisma.business.count()).resolves.toBe(0);
  });

  it('accepts an EXEMPT Business without any Tax Rate', async () => {
    const payload = request({ taxRates: [] });
    (payload.business as Record<string, unknown>).vatRegime = 'EXEMPT';
    const response = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(response.status).toBe(201);
  });

  it('rolls back the whole provisioning when a Unit code already exists', async () => {
    await prisma.unit.create({ data: { code: 'PCS', allowsFraction: false } });
    const response = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request()),
    });
    expect(response.status).toBe(409);
    await expect(prisma.business.count()).resolves.toBe(0);
    await expect(prisma.authUser.count()).resolves.toBe(0);
    await expect(prisma.unit.count()).resolves.toBe(1);
  });

  it('lets exactly one of two simultaneous visitors complete Setup', async () => {
    const [a, b] = await Promise.all([
      fetch(`${baseUrl}/api/setup/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request()),
      }),
      // The second request is deliberately delayed so the advisory lock has a
      // real contender instead of a degenerate race.
      pause(50).then(() =>
        fetch(`${baseUrl}/api/setup/complete`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(request()),
        }),
      ),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 404]);
    await expect(prisma.business.count()).resolves.toBe(1);
  });

  it('writes module enablement from Setup and defaults PRODUCTION off', async () => {
    const response = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request({ modules: { SALES: true, PURCHASING: true, INVENTORY: true, FINANCE: true, PRODUCTION: false, E_INVOICING: false } })),
    });
    expect(response.status).toBe(201);
    const states = await prisma.moduleState.findMany({ orderBy: { module: 'asc' } });
    expect(states.find((s) => s.module === 'PRODUCTION')?.isEnabled).toBe(false);
    expect(states.find((s) => s.module === 'SALES')?.isEnabled).toBe(true);
  });
});

function safeAdmin(email: string): { email: string; name: string; password: string } {
  return { email, name: 'Firmin Testateur', password: 'correct horse battery staple' };
}
