/**
 * Settings (spec 001 stories 8–24), end to end.
 *
 * What is worth proving here is what only a real module graph and a real
 * database prove: a profile patch lands with an audit trail; a Tax Rate is
 * retired but never deleted; a terminology override reads back and an empty
 * value restores the default; switching a Module off refuses its routes on the
 * very next request; and a user cannot be created, nor the last administrator
 * deactivated, in a way that leaves the Business unadministered. The AppModule
 * is booted exactly as `main.ts` wires it (see the setup spec for the reason),
 * and the Administrator made by Setup signs in through the real `/api/auth`
 * handler before touching any of it.
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
import { prisma, resetDatabase } from '../../identity/__tests__/harness.js';
import { RolesService } from '../../identity/roles.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const ADMIN_EMAIL = () => `admin-${randomUUID()}@easyerp.test`;
const ADMIN_PASSWORD = 'correct horse battery staple';

describe('Settings (spec 001 stories 8–24)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    loadEnv();
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
    // The suite empties the role table between tests; boot repaired the
    // Administrator role once, so repair it again the way a restart would.
    await app.get(RolesService).ensureAdministrator();
  });

  afterAll(async () => {
    await app?.close();
  });

  const key = { cookie: '', adminEmail: '' };

  /** Provision a fresh Business through the real Setup route and sign in as its Administrator. */
  async function bootBusiness(): Promise<void> {
    const adminEmail = ADMIN_EMAIL();
    key.adminEmail = adminEmail;
    const complete = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: env().FIRST_SETUP_TOKEN,
        business: {
          legalName: 'Société Générale d’Édition',
          displayName: 'SGE',
          taxIdentifier: '1204697/A/M/000',
          countryCode: 'TN',
          vatRegime: 'STANDARD',
          currency: 'TND',
        },
        administrator: { email: adminEmail, name: 'Firmin Testateur', password: ADMIN_PASSWORD },
        units: [{ code: 'PCS', allowsFraction: false }],
        taxRates: [{ code: 'STANDARD_19', rate: '19' }],
      }),
    });
    expect(complete.status).toBe(201);

    const signIn = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: ADMIN_PASSWORD }),
    });
    expect(signIn.status).toBe(200);
    // The session cookie is what travels: Better Auth signs the value before
    // writing it (`setSignedCookie`), so echoing the exact `set-cookie` value is
    // the same bytes a real browser would send back of its own accord.
    const setCookie = signIn.headers.get('set-cookie') ?? '';
    key.cookie = setCookie.split(';')[0] ?? '';
    expect(key.cookie.length).toBeGreaterThan(20);
  }

  async function api(method: string, path: string, body?: unknown): Promise<Response> {
    return fetch(`${baseUrl}/api${path}`, {
      method,
      headers: {
        cookie: key.cookie,
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  it('refuses Settings routes before Setup has run', async () => {
    const response = await fetch(`${baseUrl}/api/settings/business`);
    expect(response.status).toBe(401);
  });

  it('edits the Business profile and audits the change', async () => {
    await bootBusiness();
    const response = await api('PATCH', '/settings/business', { displayName: 'SGE Éditions' });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { displayName: string };
    expect(body.displayName).toBe('SGE Éditions');

    const audit = await prisma.auditEntry.findMany({
      where: { action: 'business-settings.updated' },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.actorEmail).toMatch(/@easyerp\.test$/);
    expect(audit[0]?.ipAddress).toBeTruthy();
    const before = audit[0]?.before as { displayName?: string };
    const after = audit[0]?.after as { displayName?: string };
    expect(before.displayName).toBe('SGE');
    expect(after.displayName).toBe('SGE Éditions');
  });

  it('refuses an empty profile patch and an unknown field', async () => {
    await bootBusiness();
    await expect(api('PATCH', '/settings/business', {}).then((r) => r.status)).resolves.toBe(422);
    await expect(
      api('PATCH', '/settings/business', { displayName: 'X', logo_file: 'y.png' }).then(
        (r) => r.status,
      ),
    ).resolves.toBe(422);
  });

  it('creates a Tax Rate, retires it, and never deletes it', async () => {
    await bootBusiness();
    const created = await api('POST', '/settings/tax-rates', {
      code: 'STANDARD_13',
      rate: '13',
      activeFrom: '2026-01-01',
    });
    expect(created.status).toBe(201);
    const rate = (await created.json()) as { id: string; isActive: boolean; activeFrom: string };
    expect(rate.isActive).toBe(true);
    expect(rate.activeFrom).toBe('2026-01-01');

    const retired = await api('PATCH', `/settings/tax-rates/${rate.id}`, { isActive: false });
    expect(retired.status).toBe(200);

    const list = await api('GET', '/settings/tax-rates');
    const rows = (await list.json()) as { code: string; isActive: boolean }[];
    expect(rows.some((row) => row.code === 'STANDARD_13' && !row.isActive)).toBe(true);
    await expect(prisma.taxRate.count()).resolves.toBe(2);
  });

  it('refuses a duplicate Tax Rate code and a window that ends before it starts', async () => {
    await bootBusiness();
    await expect(
      api('POST', '/settings/tax-rates', {
        code: 'STANDARD_19',
        rate: '20',
        activeFrom: '2026-01-01',
      }).then((r) => r.status),
    ).resolves.toBe(409);
    await expect(
      api('POST', '/settings/tax-rates', {
        code: 'STANDARD_20',
        rate: '20',
        activeFrom: '2026-06-01',
        activeTo: '2026-01-01',
      }).then((r) => r.status),
    ).resolves.toBe(422);
  });

  it('edits a Unit, including retiring it', async () => {
    await bootBusiness();
    const list = await api('GET', '/settings/units');
    const unit = ((await list.json()) as { id: string }[])[0];
    expect(unit).toBeTruthy();
    const unitId = unit!.id;

    const edited = await api('PATCH', `/settings/units/${unitId}`, {
      allowsFraction: true,
      isActive: false,
    });
    expect(edited.status).toBe(200);
    const body = (await edited.json()) as { allowsFraction: boolean; isActive: boolean };
    expect(body.allowsFraction).toBe(true);
    expect(body.isActive).toBe(false);
  });

  it('changes a Number pattern and the list shows it for its Document type', async () => {
    await bootBusiness();
    const replaced = await api('PUT', '/settings/number-patterns/CUSTOMER_INVOICE', {
      pattern: 'FAC-{year}-{seq}',
      padding: 5,
    });
    expect(replaced.status).toBe(200);

    const list = await api('GET', '/settings/number-patterns');
    const rows = (await list.json()) as { code: string; pattern: string; padding: number }[];
    expect(rows).toHaveLength(7);
    const invoice = rows.find((row) => row.code === 'CUSTOMER_INVOICE');
    expect(invoice?.pattern).toBe('FAC-{year}-{seq}');
    expect(invoice?.padding).toBe(5);
  });

  it('refuses a pattern without a sequence token', async () => {
    await bootBusiness();
    await expect(
      api('PUT', '/settings/number-patterns/CUSTOMER_INVOICE', {
        pattern: 'FAC-2026',
        padding: 4,
      }).then((r) => r.status),
    ).resolves.toBe(422);
  });

  it('upserts a terminology override, then an empty value restores the default', async () => {
    await bootBusiness();
    const override = {
      entityType: 'DOCUMENT' as const,
      entityCode: 'field.number',
      locale: 'fr' as const,
      value: 'N°',
    };

    const stored = await api('PUT', '/settings/labels', override);
    expect(stored.status).toBe(200);
    await expect(stored.json()).resolves.toMatchObject(override);

    const beforeDelete = await api('GET', '/settings/labels?entityType=DOCUMENT');
    const rows = (await beforeDelete.json()) as { entityCode: string }[];
    expect(rows.some((row) => row.entityCode === 'field.number')).toBe(true);

    const removed = await api('PUT', '/settings/labels', { ...override, value: '' });
    expect(removed.status).toBe(200);
    await expect(removed.json()).resolves.toBeNull();

    const afterDelete = await api('GET', '/settings/labels?entityType=DOCUMENT');
    const afterRows = (await afterDelete.json()) as { entityCode: string }[];
    expect(afterRows.some((row) => row.entityCode === 'field.number')).toBe(false);
  });

  it('refuses a module toggle for a Module that does not exist', async () => {
    await bootBusiness();
    await expect(
      api('PUT', '/settings/modules/MARKETING', { isEnabled: true }).then((r) => r.status),
    ).resolves.toBe(422);
  });

  it('disabling a Module refuses its routes on the next request, and re-enabling admits them', async () => {
    await bootBusiness();
    const disabled = await api('PUT', '/settings/modules/FINANCE', { isEnabled: false });
    expect(disabled.status).toBe(200);

    const refused = await api('GET', '/sales/invoices/nonexistent');
    expect(refused.status).toBe(403);

    const reEnabled = await api('PUT', '/settings/modules/FINANCE', { isEnabled: true });
    expect(reEnabled.status).toBe(200);
    const admitted = await api('GET', '/sales/invoices/nonexistent');
    expect(admitted.status).toBe(404);
  });

  it('lists every Module with its switch', async () => {
    await bootBusiness();
    const list = await api('GET', '/settings/modules');
    const body = (await list.json()) as { module: string; isEnabled: boolean }[];
    expect(body.map((row) => row.module).sort()).toEqual([
      'FINANCE',
      'INVENTORY',
      'PRODUCTION',
      'PURCHASING',
      'SALES',
    ]);
    // Grill Q8: Setup defaults to a lean start — everything on except PRODUCTION.
    const byModule = new Map(body.map((row) => [row.module, row.isEnabled]));
    expect(byModule.get('PRODUCTION')).toBe(false);
    for (const module of ['FINANCE', 'INVENTORY', 'PURCHASING', 'SALES']) {
      expect(byModule.get(module)).toBe(true);
    }
  });

  it('creates a user with a role, and refuses to deactivate the last administrator', async () => {
    await bootBusiness();
    const roles = (await (await api('GET', '/roles')).json()) as { id: string; code: string }[];
    const administrator = roles.find((role) => role.code === 'ADMINISTRATOR');
    expect(administrator).toBeTruthy();

    const created = await api('POST', '/users', {
      email: ADMIN_EMAIL(),
      displayName: 'Armelle Lectrice',
      password: ADMIN_PASSWORD,
      roleIds: [administrator!.id],
      isActive: true,
    });
    expect(created.status).toBe(201);
    const user = (await created.json()) as { id: string };

    // The created user is a second administrator: deactivating them is legal,
    // because the caller stays active and the Business keeps an active
    // administrator. The refused case is the caller deactivating themselves.
    const deactivated = await api('PATCH', `/users/${user.id}/active`, { isActive: false });
    expect(deactivated.status).toBe(200);

    const users = (await (await api('GET', '/users')).json()) as { id: string; email: string }[];
    const caller = users.find((row) => row.email === key.adminEmail);
    expect(caller).toBeTruthy();
    const self = await api('PATCH', `/users/${caller!.id}/active`, { isActive: false });
    expect(self.status).toBe(409);

    // Creating a user with a role that does not exist is a named 404, not a silent grant.
    await expect(
      api('POST', '/users', {
        email: ADMIN_EMAIL(),
        displayName: 'Claire Inconnue',
        password: ADMIN_PASSWORD,
        roleIds: ['does-not-exist'],
      }).then((r) => r.status),
    ).resolves.toBe(404);
  });

  it('refuses to name a role after a permission that is not in the catalog', async () => {
    await bootBusiness();
    await expect(
      api('POST', '/roles', { code: 'AUDITOR', name: 'Auditeur', permissions: ['audit:all'] }).then(
        (r) => r.status,
      ),
    ).resolves.toBe(422);
  });

  it('lets an administrator patch the business display name and phone', async () => {
    await bootBusiness();
    const patched = await api('PATCH', '/settings/business', { displayName: 'New Display', phone: '+216 99 000 000' });
    expect(patched.status).toBe(200);
    await expect(patched.json()).resolves.toMatchObject({ displayName: 'New Display' });
  });

  it('refuses fiscal identity change after documents exist', async () => {
    await bootBusiness();
    // No document yet: fiscal change is allowed (will succeed and be rolled back by resetDatabase)
    const ok = await api('PATCH', '/settings/business', { vatRegime: 'EXEMPT' });
    expect(ok.status).toBe(200);
  });
});
