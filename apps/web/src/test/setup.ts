import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

/**
 * Unmount everything between tests, and wipe the globals a test may have changed.
 *
 * A leaked `<html class="dark">` or a `matchMedia` stub makes the *next* test
 * pass or fail for the wrong reason, which is worse than a flaky test because it
 * is quiet. Guarded for the pure suites, which run in node and have no document.
 */
const hasDom = typeof document !== 'undefined' && typeof window !== 'undefined';

afterEach(() => {
  if (hasDom) {
    cleanup();
    document.documentElement.className = '';
    document.documentElement.style.colorScheme = '';
    window.localStorage.clear();
  }
});
