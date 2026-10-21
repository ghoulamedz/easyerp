import { defineConfig, devices } from '@playwright/test';

/** Where the production web build is served. */
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3100);
/**
 * Where the API is started for these tests.
 *
 * Not 3002: that is the port `pnpm dev` uses, and starting a second API on it
 * while a development server is already running fails in a way that reads like an
 * application bug.
 */
const API_PORT = Number(process.env.E2E_API_PORT ?? 3102);

/**
 * The repository root, so the `webServer` commands below can build through Turborepo.
 *
 * Building each package with `pnpm --filter <pkg> build` runs `tsc` on that package
 * alone. `@easyerp/contracts` is a workspace dependency with its own `dist`, and a
 * clean clone has none — so a direct build fails with one `Cannot find module
 * '@easyerp/contracts'` per import. Locally that was invisible, because `dist/` was
 * already there from an earlier build; in CI it failed every run.
 */
const repoRoot = '../..';

const baseURL = `http://127.0.0.1:${WEB_PORT}`;
const apiURL = `http://127.0.0.1:${API_PORT}`;

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

/**
 * The API's environment, for the process Playwright starts below.
 *
 * The values here are defaults that a real environment overrides — CI sets its own
 * in the workflow. The secret is a throwaway that satisfies the 32-character
 * minimum in `apps/api/src/config/env.ts`; it protects nothing and grants nothing,
 * because this database is created and destroyed per run.
 *
 * `DATABASE_URL` matches `apps/api/.env`, so `pnpm test:e2e` works against the
 * same PostgreSQL that `pnpm dev` uses, without a second setup step.
 */
const apiEnv = {
  NODE_ENV: process.env.NODE_ENV ?? 'test',
  API_PORT: String(API_PORT),
  API_HOST: '127.0.0.1',
  DATABASE_URL:
    process.env.DATABASE_URL ??
    'postgresql://easyerp:easyerp@localhost:55432/easyerp?schema=public',
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? 'e2e-only-secret-e2e-only-secret-1234',
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? baseURL,
  CORS_ORIGINS: process.env.CORS_ORIGINS ?? baseURL,
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'warn',
};

export default defineConfig({
  testDir: './e2e',
  /**
   * Seed a configured Business through the real Setup endpoint before the workers
   * start. A fresh database redirects every page to `/setup` (ADR 0012), so
   * without this the suite asserts against a first-run screen it never meant to
   * visit; with it, the fixture is produced by the same transaction a customer's
   * first minute produces. A no-op when a Business already exists.
   */
  globalSetup: './e2e/global-setup.ts',
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
  /**
   * Both halves of the application, because a browser test against a web app with
   * nothing behind its `/api` proxy proves only that the HTML renders.
   *
   * The API is a production build started from `dist`, built here rather than in
   * CI's install step so that `pnpm test:e2e` alone is a complete gate. It must
   * be built: `start` runs `node dist/main.js`, and `dist` is not committed.
   *
   * The web build's proxy target is set here rather than inherited, because in
   * development `next.config.ts` defaults to the API's dev port and this test
   * runs on a different one.
   */
  webServer: [
    {
      // `turbo run build` honours `dependsOn: ["^build"]`, so the contracts package is
      // compiled before the code that imports it. The filter keeps the web out of this
      // process; Turbo's cache makes the second server's build a no-op.
      command: 'pnpm turbo run build --filter=@easyerp/api && pnpm --filter @easyerp/api start',
      cwd: repoRoot,
      url: `${apiURL}/api/health`,
      env: apiEnv,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `pnpm turbo run build --filter=@easyerp/web && pnpm --filter @easyerp/web start --port ${WEB_PORT}`,
      cwd: repoRoot,
      url: baseURL,
      env: { API_INTERNAL_URL: apiURL },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
