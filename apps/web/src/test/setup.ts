import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { forgetSession } from '../lib/client-session';

/**
 * Unmount everything between tests, and wipe the globals a test may have changed.
 *
 * A leaked `<html class="dark">` or a `matchMedia` stub makes the *next* test
 * pass or fail for the wrong reason, which is worse than a flaky test because it
 * is quiet. Guarded for the pure suites, which run in node and have no document.
 */
const hasDom = typeof document !== 'undefined' && typeof window !== 'undefined';

/**
 * Drop the shared session answer between tests.
 *
 * `fetchSession` is deduplicated at module level, which is what stops a list screen
 * asking sixteen times — but module state outlives a test. Without this, the second test
 * in a file inherits the first one's session and asserts against the wrong permissions,
 * which is a quiet wrong answer rather than a failure.
 */
beforeEach(() => {
  forgetSession();
});

afterEach(() => {
  if (hasDom) {
    cleanup();
    document.documentElement.className = '';
    document.documentElement.style.colorScheme = '';
    window.localStorage.clear();
  }
});
