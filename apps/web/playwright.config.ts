import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * An alternative Chromium, for machines where Playwright's own download is
 * unreachable.
 *
 * Playwright fetches its browser from `storage.googleapis.com`, which some
 * networks block; the install then sits at 0% forever rather than failing. Where
 * the operating system already ships a compatible Chromium, point
 * `CHROMIUM_PATH` at it. Left unset, Playwright uses its bundled build — which
 * is what CI does, and what should stay the default.
 */
const executablePath = process.env.CHROMIUM_PATH;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // A production build, not the dev server: RTL and hydration bugs do not only
    // appear in development.
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
