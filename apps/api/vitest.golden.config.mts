/**
 * Golden tests compare a rendered document byte for byte against a committed PDF.
 *
 * They are the only tests that need a browser, which is why they have their own
 * config instead of running inside `pnpm verify`. Keeping Chromium out of the fast
 * gate means a contributor without the browser installed still gets the fast gate;
 * the golden gate is then a command the CI `golden` job and the changed-document
 * checklist both name.
 *
 * To re-bless after an intended template change:
 *
 *   pnpm test:golden -- --update
 *
 * then read the resulting diff. A re-bless that nobody read is how a layout
 * regression becomes the new baseline.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.golden.spec.ts'],
    exclude: ['node_modules/**', 'dist/**', 'src/generated/**'],
    environment: 'node',
    // Chromium launch plus the font wait is slower than a default test, and a
    // timeout here would look like a rendering failure.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    reporters: ['default'],
  },
});
