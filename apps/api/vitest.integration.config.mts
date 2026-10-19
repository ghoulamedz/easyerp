import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.spec.ts'],
    exclude: ['node_modules/**', 'dist/**', 'src/generated/**'],
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
