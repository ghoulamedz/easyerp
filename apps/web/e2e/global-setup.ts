/**
 * Make the database this run will use look like a configured Business.
 *
 * A fresh database now sends every visitor to `/setup` — that is deliberate (the
 * first-run gate, ADR 0012), and it is also why the browser suite has to arrange
 * its own starting state: without a Business, `/fr/sign-in` redirects and every
 * test that signs in asserts against a setup screen it never intended to visit.
 *
 * The seeding goes through the real `POST /api/setup` rather than inserting rows,
 * so the fixture is produced by the same transaction a customer's first minute
 * produces: Business, Administrator, Units, Tax Rates and number patterns. A test
 * that invents rows tests a database shape no deployment ever has.
 *
 * It runs once per `playwright test`, before the workers start, and is a no-op
 * when a Business already exists — which is the normal case for a developer's
 * database that has been set up by hand.
 */

import type { FullConfig } from '@playwright/test';

const API_PORT = Number(process.env.E2E_API_PORT ?? 3102);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3100);
const apiURL = process.env.E2E_API_URL ?? `http://127.0.0.1:${API_PORT}`;

/**
 * The token the API was started with.
 *
 * `playwright.config.ts` does not set `FIRST_SETUP_TOKEN`, so the API is running
 * with `env.ts`'s documented development default. Spelled out here rather than
 * imported, because this file must not import from the API's source tree: the
 * gate would then pass or fail on a compile of code it is not testing.
 */
const SETUP_TOKEN = process.env.FIRST_SETUP_TOKEN ?? 'dev-first-setup-token';

export const TEST_USER = { email: 'admin@test.com', password: 'password123' } as const;

export default async function globalSetup(config: FullConfig): Promise<void> {
  const status = await fetch(`${apiURL}/api/setup/status`);
  if (!status.ok) {
    throw new Error(
      `Could not read setup status from ${apiURL}/api/setup/status (HTTP ${status.status}). ` +
        'The browser suite needs the API this config starts; a failure here means it is not answering.',
    );
  }

  const { needsSetup } = (await status.json()) as { needsSetup?: boolean };
  if (needsSetup === false) {
    await assertTestAccountCanSignIn(config);
    return;
  }

  const response = await fetch(`${apiURL}/api/setup/complete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      token: SETUP_TOKEN,
      business: {
        legalName: 'EasyERP Test SARL',
        displayName: 'EasyERP Test',
        taxIdentifier: '1234567/A/M/000',
        countryCode: 'TN',
        vatRegime: 'STANDARD',
        currency: 'TND',
      },
      administrator: {
        email: TEST_USER.email,
        name: 'Test Administrator',
        password: TEST_USER.password,
      },
      // One Unit and one Tax Rate: enough for a STANDARD Business to be legal,
      // and exactly what the setup contract requires rather than a fixture that
      // would make the suite pass on data Setup itself would refuse.
      units: [{ code: 'PCS', allowsFraction: true }],
      taxRates: [{ code: 'STANDARD_19', rate: '19.000' }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Seeding the Business through POST /api/setup failed (HTTP ${response.status}): ${body}`,
    );
  }
}

/**
 * Refuse to start when the suite's own account cannot sign in.
 *
 * Two situations produce that, and both are worth one clear message rather than a
 * dozen tests failing on `expected /fr/dashboard, received /fr/sign-in`:
 *
 * - the database already holds a Business (so Setup is correctly closed) but not
 *   the test account — a developer's working database, which this suite must not
 *   mutate;
 * - Setup ran and something downstream is broken.
 *
 * The distinction is why this check exists at all: without it, the first
 * assertion failure looks like a layout bug in a page the run never reached.
 */
async function assertTestAccountCanSignIn(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL ?? `http://127.0.0.1:${WEB_PORT}`;

  const response = await fetch(`${apiURL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseURL },
    body: JSON.stringify({ email: TEST_USER.email, password: TEST_USER.password }),
  });

  if (response.ok) return;

  throw new Error(
    `The browser suite signs in as ${TEST_USER.email}, and this database does not accept that ` +
      `account (HTTP ${response.status}). If a Business already exists here, Setup is closed and ` +
      'the suite cannot create it: point DATABASE_URL at a fresh database (for example ' +
      '`createdb easyerp_e2e` plus `prisma migrate deploy`) so Setup can seed it, or run ' +
      '`pnpm db:reset` to start from empty.',
  );
}
