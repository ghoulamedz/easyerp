/**
 * Catalog & counterparties (spec 001 stories 25–32, Q10), end to end.
 *
 * What a real module graph and a real database prove here: an Item and a Party
 * are written with their decimals intact; a duplicate code and a duplicate tax
 * identifier are each a named 409; a screen typo is refused by the strict input
 * shape; search is paged and the total is honest; a Customer's terms travel only
 * with the CUSTOMER role and are cleared — in the same write — when the role is
 * dropped; and neither resource has a DELETE route, because both are retired,
 * never removed. The AppModule is booted exactly as `main.ts` wires it and the
 * Administrator made by Setup signs in through the real `/api/auth` handler.
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

interface ItemRecord {
  id: string;
  code: string;
  name: string;
  description: string | null;
  itemType: string;
  baseUnitId: string;
  purchaseUnitId: string | null;
  saleUnitId: string | null;
  taxRateId: string;
  salePrice: string;
  purchasePrice: string;
  reorderPoint: string | null;
  isService: boolean;
  isActive: boolean;
}

interface PartyRecord {
  id: string;
  code: string;
  name: string;
  roles: string[];
  taxIdentifier: string | null;
  isActive: boolean;
  customerTerms?: {
    paymentTermDays: number;
    creditLimit: string | null;
    deliveryAddress: string | null;
  };
}

describe('Catalog & counterparties (spec 001 stories 25–32)', () => {
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
    await app.get(RolesService).ensureAdministrator();
  });

  afterAll(async () => {
    await app?.close();
  });

  const key = { cookie: '', baseUnitId: '', taxRateId: '' };

  async function bootBusiness(): Promise<void> {
    const adminEmail = ADMIN_EMAIL();
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
    const setCookie = signIn.headers.get('set-cookie') ?? '';
    key.cookie = setCookie.split(';')[0] ?? '';
    expect(key.cookie.length).toBeGreaterThan(20);

    const units = (await (await api('GET', '/settings/units')).json()) as { id: string }[];
    key.baseUnitId = units[0]!.id;
    const rates = (await (await api('GET', '/settings/tax-rates')).json()) as {
      id: string;
      code: string;
    }[];
    key.taxRateId = rates.find((rate) => rate.code === 'STANDARD_19')!.id;
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

  function itemPayload(
    code: string,
    itemType: 'FINISHED_GOOD' | 'SERVICE' = 'FINISHED_GOOD',
  ): Record<string, unknown> {
    return {
      code,
      name: `Item ${code}`,
      description: `The ${code} unit`,
      itemType,
      baseUnitId: key.baseUnitId,
      purchaseUnitId: null,
      saleUnitId: null,
      taxRateId: key.taxRateId,
      salePrice: '12.500',
      purchasePrice: '8.000',
      reorderPoint: '10',
      isActive: true,
    };
  }

  it('creates an Item with decimals intact and audits the write', async () => {
    await bootBusiness();
    const response = await api('POST', '/items', itemPayload('SAV-001'));
    expect(response.status).toBe(201);
    const item = (await response.json()) as ItemRecord;
    expect(item.salePrice).toBe('12.500');
    expect(item.purchasePrice).toBe('8.000');
    expect(item.isService).toBe(false);
    expect(item.description).toBe('The SAV-001 unit');

    const audit = await prisma.auditEntry.findMany({ where: { action: 'item.created' } });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.entityId).toBe(item.id);
    expect(audit[0]?.actorEmail).toMatch(/@easyerp\.test$/);
    expect((audit[0]?.after as unknown as ItemRecord)?.salePrice).toBe('12.500');
  });

  it('derives isService from the item type, not from anything the client sends', async () => {
    await bootBusiness();
    const response = await api('POST', '/items', itemPayload('SRV-001', 'SERVICE'));
    expect(response.status).toBe(201);
    const item = (await response.json()) as ItemRecord;
    expect(item.itemType).toBe('SERVICE');
    expect(item.isService).toBe(true);
  });

  it('refuses an Item with an unknown field (the strict screen-typo rule)', async () => {
    await bootBusiness();
    const response = await api('POST', '/items', { ...itemPayload('SAV-002'), qty: 4 });
    expect(response.status).toBe(422);
  });

  it('refuses an Item referencing a unit or Tax Rate that does not exist', async () => {
    await bootBusiness();
    await expect(
      api('POST', '/items', { ...itemPayload('SAV-003'), baseUnitId: 'no-such-unit' }).then(
        (r) => r.status,
      ),
    ).resolves.toBe(422);
    await expect(
      api('POST', '/items', { ...itemPayload('SAV-004'), taxRateId: 'no-such-rate' }).then(
        (r) => r.status,
      ),
    ).resolves.toBe(422);
  });

  it('refuses an Item under a retired Tax Rate', async () => {
    await bootBusiness();
    const rate = await api('POST', '/settings/tax-rates', {
      code: 'STANDARD_07',
      rate: '7',
      activeFrom: '2026-01-01',
    });
    const retired = (await rate.json()) as { id: string };
    await api('PATCH', `/settings/tax-rates/${retired.id}`, { isActive: false });

    await expect(
      api('POST', '/items', { ...itemPayload('SAV-005'), taxRateId: retired.id }).then(
        (r) => r.status,
      ),
    ).resolves.toBe(422);
  });

  it('rejects a duplicate Item code with 409', async () => {
    await bootBusiness();
    await expect(api('POST', '/items', itemPayload('SAV-006')).then((r) => r.status)).resolves.toBe(
      201,
    );
    await expect(
      api('POST', '/items', { ...itemPayload('SAV-006'), name: 'Duplicate' }).then((r) => r.status),
    ).resolves.toBe(409);
  });

  it('edits an Item, retires it, and edits by partial patch only', async () => {
    await bootBusiness();
    const created = (await (
      await api('POST', '/items', itemPayload('SAV-007'))
    ).json()) as ItemRecord;

    const edited = await api('PATCH', `/items/${created.id}`, {
      description: 'Renumbered shelf line',
      salePrice: '13.750',
    });
    expect(edited.status).toBe(200);
    const after = (await edited.json()) as ItemRecord;
    expect(after.description).toBe('Renumbered shelf line');
    expect(after.salePrice).toBe('13.750');
    expect(after.purchasePrice).toBe('8.000');
    expect(after.code).toBe('SAV-007');

    const retired = await api('PATCH', `/items/${created.id}`, { isActive: false });
    expect(retired.status).toBe(200);
    expect(((await retired.json()) as ItemRecord).isActive).toBe(false);

    await expect(
      api('PATCH', `/items/${created.id}`, { salePrice: '14', typo_field: true }).then(
        (r) => r.status,
      ),
    ).resolves.toBe(422);

    const audit = await prisma.auditEntry.findMany({ where: { action: 'item.updated' } });
    expect(audit.some((entry) => entry.entityId === created.id)).toBe(true);
  });

  it('searches and pages the catalog (Q10)', async () => {
    await bootBusiness();
    await api('POST', '/items', itemPayload('ALPHA-001'));
    await api('POST', '/items', itemPayload('ALPHA-002'));
    await api('POST', '/items', itemPayload('BETA-001'));

    const searched = await api('GET', '/items?q=alpha');
    expect(searched.status).toBe(200);
    const page = (await searched.json()) as {
      items: ItemRecord[];
      total: number;
      page: number;
      pageSize: number;
    };
    expect(page.total).toBe(2);
    expect(page.pageSize).toBe(25);
    expect(page.page).toBe(1);
    expect(page.items.map((item) => item.code).sort()).toEqual(['ALPHA-001', 'ALPHA-002']);

    const limited = await api('GET', '/items?pageSize=1&page=2&q=');
    const smallPage = (await limited.json()) as {
      items: ItemRecord[];
      total: number;
      page: number;
    };
    expect(smallPage.total).toBe(3);
    expect(smallPage.page).toBe(2);
    expect(smallPage.items).toHaveLength(1);
  });

  it('has no DELETE route for Items: an Item is retired, never removed', async () => {
    await bootBusiness();
    const created = (await (
      await api('POST', '/items', itemPayload('SAV-008'))
    ).json()) as ItemRecord;
    const gone = await api('DELETE', `/items/${created.id}`);
    expect(gone.status).toBe(404);
    await expect(prisma.item.count({ where: { id: created.id } })).resolves.toBe(1);
  });

  function partyPayload(
    code: string,
    name: string,
    roles: string[],
    taxIdentifier: string,
  ): Record<string, unknown> {
    return {
      code,
      name,
      roles,
      taxIdentifier,
      email: null,
      phone: null,
      address: null,
      city: null,
      countryCode: null,
      isActive: true,
    };
  }

  it('creates a Customer with terms and a supplier without; terms refuse to ride with a supplier', async () => {
    await bootBusiness();
    const customer = await api('POST', '/parties', {
      ...partyPayload('CUST-001', 'Librairie Centrale', ['CUSTOMER'], 'TUN-CUST-001'),
      customerTerms: {
        paymentTermDays: 30,
        creditLimit: '5000.000',
        deliveryAddress: '12 Rue du Liban, Tunis',
      },
    });
    expect(customer.status).toBe(201);
    const created = (await customer.json()) as PartyRecord;
    expect(created.roles).toEqual(['CUSTOMER']);
    expect(created.customerTerms).toEqual({
      paymentTermDays: 30,
      creditLimit: '5000.000',
      deliveryAddress: '12 Rue du Liban, Tunis',
    });

    const supplier = await api(
      'POST',
      '/parties',
      partyPayload('SUPP-001', 'Papeterie du Nord', ['SUPPLIER'], 'TUN-SUPP-001'),
    );
    expect(supplier.status).toBe(201);
    expect(((await supplier.json()) as PartyRecord).customerTerms).toBeUndefined();

    const refused = await api('POST', '/parties', {
      ...partyPayload('SUPP-002', 'Fourniture Moderne', ['SUPPLIER'], 'TUN-SUPP-002'),
      customerTerms: { paymentTermDays: 30, creditLimit: '100.000', deliveryAddress: null },
    });
    expect(refused.status).toBe(422);
  });

  it('preserves terms on an unrelated edit and clears them when the CUSTOMER role is dropped', async () => {
    await bootBusiness();
    const created = (await (
      await api('POST', '/parties', {
        ...partyPayload('CUST-002', 'Maison du Livre', ['CUSTOMER'], 'TUN-CUST-002'),
        customerTerms: {
          paymentTermDays: 45,
          creditLimit: '2500.000',
          deliveryAddress: 'Avenue Habib Bourguiba',
        },
      })
    ).json()) as PartyRecord;

    const renamed = await api('PATCH', `/parties/${created.id}`, { name: 'Maison du Livre SARL' });
    expect(renamed.status).toBe(200);
    expect(((await renamed.json()) as PartyRecord).customerTerms?.paymentTermDays).toBe(45);

    const demoted = await api('PATCH', `/parties/${created.id}`, { roles: ['SUPPLIER'] });
    expect(demoted.status).toBe(200);
    const after = (await demoted.json()) as PartyRecord;
    expect(after.customerTerms).toBeUndefined();
    const row = await prisma.party.findUnique({ where: { id: created.id } });
    expect(row?.paymentTermDays).toBeNull();
    expect(row?.creditLimit).toBeNull();
    expect(row?.deliveryAddress).toBeNull();
  });

  it('rejects a duplicate Party code and a duplicate tax identifier with 409', async () => {
    await bootBusiness();
    const payload = partyPayload('CUST-003', 'Librairie Unique', ['CUSTOMER'], 'TUN-CUST-003');
    await expect(api('POST', '/parties', payload).then((r) => r.status)).resolves.toBe(201);
    await expect(api('POST', '/parties', payload).then((r) => r.status)).resolves.toBe(409);
    await expect(
      api('POST', '/parties', { ...payload, code: 'CUST-004' }).then((r) => r.status),
    ).resolves.toBe(409);
  });

  it('searches Parties and pages the directory', async () => {
    await bootBusiness();
    await api(
      'POST',
      '/parties',
      partyPayload('CUST-010', 'Alpha Presse', ['CUSTOMER'], 'TUN-CUST-010'),
    );
    await api(
      'POST',
      '/parties',
      partyPayload('SUPP-010', 'Beta Imprimeur', ['SUPPLIER'], 'TUN-SUPP-010'),
    );

    const searched = await api('GET', '/parties?q=imprimeur');
    expect(searched.status).toBe(200);
    const page = (await searched.json()) as { items: PartyRecord[]; total: number };
    expect(page.total).toBe(1);
    expect(page.items[0]?.name).toBe('Beta Imprimeur');

    const all = await api('GET', '/parties');
    const directory = (await all.json()) as { items: PartyRecord[]; total: number };
    expect(directory.total).toBe(3); // 2 created in test + INTERNAL from Setup
  });

  it('retires a Party and has no DELETE route for it either', async () => {
    await bootBusiness();
    const created = (await (
      await api('POST', '/parties', {
        ...partyPayload('CUST-011', 'Dernière Page', ['CUSTOMER'], 'TUN-CUST-011'),
        customerTerms: { paymentTermDays: 15, creditLimit: null, deliveryAddress: null },
      })
    ).json()) as PartyRecord;

    const retired = await api('PATCH', `/parties/${created.id}`, { isActive: false });
    expect(retired.status).toBe(200);
    expect(((await retired.json()) as PartyRecord).isActive).toBe(false);

    const read = await api('GET', `/parties/${created.id}`);
    expect(read.status).toBe(200);
    expect(((await read.json()) as PartyRecord).isActive).toBe(false);

    const gone = await api('DELETE', `/parties/${created.id}`);
    expect(gone.status).toBe(404);
    await expect(prisma.party.count({ where: { id: created.id } })).resolves.toBe(1);
  });

  it('404s an unknown Item and Party by id', async () => {
    await bootBusiness();
    await expect(api('GET', '/items/no-such-item').then((r) => r.status)).resolves.toBe(404);
    await expect(
      api('PATCH', '/items/no-such-item', { name: 'x' }).then((r) => r.status),
    ).resolves.toBe(404);
    await expect(api('GET', '/parties/no-such-party').then((r) => r.status)).resolves.toBe(404);
    await expect(
      api('PATCH', '/parties/no-such-party', { name: 'x' }).then((r) => r.status),
    ).resolves.toBe(404);
  });
});
