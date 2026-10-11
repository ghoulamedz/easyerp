/**
 * Layout and theming, checked in a browser rather than asserted in prose.
 *
 * The failures these guard against are silent: absolute `left` values and
 * physical padding produce a page that looks fine in French and overflows in
 * Arabic, and nobody notices until a customer does. A theme that resets on every
 * navigation fails the same way — it looks right, once.
 */

import { expect, test } from '@playwright/test';

const TEST_USER = { email: 'admin@test.com', password: 'password123' };

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/fr/sign-in');
  await page.fill('input[name="email"]', TEST_USER.email);
  await page.fill('input[name="password"]', TEST_USER.password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/fr/dashboard');
}

test.describe('right-to-left locale', () => {
  test('serves Arabic as right-to-left', async ({ page }) => {
    await page.goto('/ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  });

  test('serves French and English as left-to-right', async ({ page }) => {
    await page.goto('/fr');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await page.goto('/en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });

  test('never overflows horizontally in Arabic', async ({ page }) => {
    await page.goto('/ar');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('renders the same layout in every locale', async ({ page }) => {
    // Selectors are test ids, not utility classes: a check pinned to a
    // Tailwind class breaks on every design change and gets deleted.
    await signIn(page);
    for (const locale of ['fr', 'en', 'ar']) {
      await page.goto(`/${locale}/dashboard`);
      await expect(page.getByTestId('brand-mark')).toBeVisible();
      await expect(page.getByTestId('main-content')).toBeVisible();
    }
  });

  test('rejects an unknown locale', async ({ page }) => {
    const response = await page.goto('/de');
    expect(response?.status()).toBe(404);
  });

  test('sends the bare origin to the default locale', async ({ page }) => {
    // Without a root route, `/` matches `[locale]` with an empty locale and the
    // visitor gets a 404 instead of the application.
    // Since no session exists, the dashboard layout redirects to sign-in.
    await page.goto('/');
    expect(page.url()).toContain('/fr/sign-in');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  });
});

test.describe('night and day', () => {
  // The settings page renders a named "Apparence" group; the topbar renders a
  // second copy labelled "Thème". Scoping by name is what a screen reader does
  // too, and it keeps the test from silently clicking the topbar instead.
  const appearance = (page: import('@playwright/test').Page) =>
    page.getByRole('radiogroup', { name: 'Apparence' });

  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('applies the dark theme for the whole document, not one panel', async ({ page }) => {
    await page.goto('/fr/settings');

    await appearance(page).getByRole('radio', { name: 'Nuit' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    // If only a subtree were themed, the page edges would stay white.
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).not.toBe('rgb(255, 255, 255)');
  });

  test('survives a reload, so the choice is not merely session state', async ({ page }) => {
    await page.goto('/fr/settings');
    await appearance(page).getByRole('radio', { name: 'Nuit' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(appearance(page).getByRole('radio', { name: 'Nuit' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  test('applies the theme on the very first paint, with no white flash', async ({ page }) => {
    await page.goto('/fr/settings');
    await appearance(page).getByRole('radio', { name: 'Nuit' }).click();

    // Reload and sample the class before any script could react. A flash of light
    // here means the bootstrap script in <head> is not doing its job.
    await page.goto('/fr/settings');
    const darkAtFirstPaint = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );
    expect(darkAtFirstPaint).toBe(true);
  });

  test('returns to the light theme', async ({ page }) => {
    await page.goto('/fr/settings');
    await appearance(page).getByRole('radio', { name: 'Nuit' }).click();
    await appearance(page).getByRole('radio', { name: 'Jour' }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });
});

test.describe('status panel', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('reports degraded rather than operational when the API is unreachable', async ({ page }) => {
    // The end-to-end server runs on its own port with no API behind it, which is
    // exactly the situation where an optimistic panel would lie.
    await page.route('**/api/health', (route) => route.abort());
    await page.route('**/api/ready', (route) => route.abort());

    await page.goto('/fr/dashboard');
    await expect(page.getByText('Dégradé')).toBeVisible();
    await expect(page.getByText('Opérationnel')).toHaveCount(0);
  });

  test('reports operational when both endpoints answer', async ({ page }) => {
    await page.route('**/api/health', (route) =>
      route.fulfill({ json: { status: 'ok', checks: {} } }),
    );
    await page.route('**/api/ready', (route) =>
      route.fulfill({ json: { status: 'ok', checks: { database: 'ok' } } }),
    );

    await page.goto('/fr/dashboard');
    await expect(page.getByText('Opérationnel')).toBeVisible();
  });

  test('reads the real API through the web app, not a stub', async ({ page }) => {
    // The two tests above both intercept the network, so between them they prove
    // the panel's logic and nothing about the plumbing. This one does not
    // intercept: the request leaves the browser, Next rewrites `/api/*` to
    // API_INTERNAL_URL, and the API answers from a real PostgreSQL.
    //
    // It is the test that fails when the proxy target is wrong, when the API
    // refuses to start because its environment is invalid, or when `/api/ready`
    // stops reporting the database — none of which any other gate can see.
    const problems: string[] = [];
    page.on('response', (response) => {
      if (response.url().includes('/api/') && !response.ok()) {
        problems.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto('/fr/dashboard');
    await expect(page.getByText('Opérationnel')).toBeVisible();
    await expect(page.getByText('Dégradé')).toHaveCount(0);

    // Both endpoints answered 2xx, or the panel would read Dégradé. Asserted
    // explicitly as well so a future change to the panel's wording cannot make
    // this test pass by checking nothing.
    expect(problems).toEqual([]);
  });
});
