import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Pure logic runs in node; component tests opt into jsdom with a
    // `@vitest-environment jsdom` docblock, so neither pays for the other's cost.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    setupFiles: ['src/test/setup.ts'],
    passWithNoTests: false,
    restoreMocks: true,
  },
});
