import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/__tests__/**/*.spec.ts', 'node_modules/**', 'dist/**', 'src/generated/**'],
    environment: 'node',
    reporters: ['default'],
  },
});
