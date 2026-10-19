import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.spec.ts'],
    // The golden suite has its own config (`vitest.golden.config.mts`) and its own
    // command because it is the only suite that needs a browser, and it compares
    // committed PDFs byte for byte. Running it here as well would make the
    // database gate fail for a reason that has nothing to do with the database —
    // a differently built Chromium — and would report it as an integration
    // failure. `pnpm test:golden` is the gate that owns it.
    exclude: ['node_modules/**', 'dist/**', 'src/generated/**', 'src/**/*.golden.spec.ts'],
    environment: 'node',
    setupFiles: ['src/__tests__/setup-env.ts'],
    testTimeout: 60_000,
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    reporters: ['default'],
    resolve: {
      extensions: ['.ts', '.js'],
    },
  },
});
