/**
 * @vitest-environment jsdom
 *
 * The theme store: the parts a component-local `useState` could never do —
 * following the system while nobody has chosen, and agreeing with another tab.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  renderHook,
  type RenderHookResult,
  type RenderHookOptions,
} from '@testing-library/react';
import { setThemePreference, useResolvedTheme, useThemePreference } from './theme-store';
import { THEME_STORAGE_KEY } from './theme';

/** A controllable `matchMedia`, so a test can fire the event a real browser fires. */
function installMatchMedia(prefersDark: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const handle = {
    matches: prefersDark,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.delete(listener),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => handle),
  );
  return {
    set(next: boolean) {
      handle.matches = next;
      for (const listener of listeners) {
        listener({ matches: next } as MediaQueryListEvent);
      }
    },
  };
}

/**
 * Every hook this file renders is unmounted again.
 *
 * The store is module-level and shared, so a hook left mounted keeps its
 * subscription, `listeners` never empties, and the next test silently gets a
 * store that is no longer attaching its media listener. That failure is invisible
 * in the test that caused it and shows up three cases later as something else.
 */
const unmounts: (() => void)[] = [];

function render<T>(callback: () => T) {
  const result = renderHook(callback);
  unmounts.push(result.unmount);
  return result;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

afterEach(() => {
  for (const unmount of unmounts.splice(0)) unmount();
  vi.unstubAllGlobals();
});

describe('useThemePreference', () => {
  it('reports the stored choice', () => {
    installMatchMedia(false);
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    const { result } = render(() => useThemePreference());
    expect(result.current).toBe('dark');
  });

  it('is `system` when nothing was chosen', () => {
    installMatchMedia(false);
    const { result } = render(() => useThemePreference());
    expect(result.current).toBe('system');
  });

  it('notifies subscribers when the choice changes', () => {
    installMatchMedia(false);
    const { result } = render(() => useThemePreference());
    expect(result.current).toBe('system');

    // `act` because these are writes from outside React. Without it the update
    // is scheduled but never flushed, and the assertion reads a stale render.
    act(() => setThemePreference('dark'));
    expect(result.current).toBe('dark');

    act(() => setThemePreference('system'));
    expect(result.current).toBe('system');
  });
});

describe('useResolvedTheme', () => {
  it('follows the system preference changing under it', () => {
    const media = installMatchMedia(false);
    const { result } = render(() => useResolvedTheme());
    expect(result.current).toBe('light');

    // No click, no reload: the operating system switched to dark at sunset.
    act(() => media.set(true));
    expect(result.current).toBe('dark');
  });

  it('stops following once the person has chosen for themselves', () => {
    const media = installMatchMedia(false);
    setThemePreference('light');
    const { result } = render(() => useResolvedTheme());
    expect(result.current).toBe('light');

    // The system changed, but the choice outranks it. Following anyway would
    // make the control lie: "light" selected, dark on screen.
    act(() => media.set(true));
    expect(result.current).toBe('light');
  });

  it('adopts a choice made in another tab', () => {
    installMatchMedia(false);
    const { result } = render(() => useResolvedTheme());
    expect(result.current).toBe('light');

    // What the storage event looks like when a sibling tab writes.
    act(() => {
      window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
      window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY }));
    });
    expect(result.current).toBe('dark');
  });

  it('ignores a storage event about something else', () => {
    installMatchMedia(false);
    const { result } = render(() => useResolvedTheme());

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'something.else' }));
    });
    expect(result.current).toBe('light');
  });

  it('removes the key entirely for `system`, so no stale choice survives', () => {
    installMatchMedia(true);
    setThemePreference('light');
    setThemePreference('system');

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(render(() => useResolvedTheme()).result.current).toBe('dark');
  });

  it('detaches its listeners when the last subscriber goes away', () => {
    const media = installMatchMedia(false);
    const first = render(() => useResolvedTheme());
    first.unmount();

    // With nothing listening, a system change must not reach a dead component.
    expect(() => act(() => media.set(true))).not.toThrow();
    expect(render(() => useResolvedTheme()).result.current).toBe('dark');
  });
});
