import { defineConfig } from 'vitest/config';

/**
 * Integration tests run against a real PostgreSQL, because the invariants this
 * product depends on — row locks under concurrency, the administrator invariant,
 * `numeric(18,3)` rounding — are properties of the database, not of a mock.
 *
 * `DATABASE_URL` must point at a database with the migrations already applied:
 *
 *   docker compose -f infra/compose/compose.test.yaml up -d
 *   pnpm --filter @easyerp/api prisma:migrate:deploy
 *   pnpm test:integration
 *
 * Serial, because they share one database and truncate its tables between tests.
 */
export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.spec.ts'],
    exclude: ['node_modules/**', 'dist/**', 'src/generated/**'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    reporters: ['default'],
  },
});
