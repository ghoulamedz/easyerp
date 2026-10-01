/**
 * The theme preference as an external store.
 *
 * Reading `localStorage` in a component body and pushing it into state with an
 * effect is the shape React warns about: it renders twice, and it has a window
 * where the server's markup and the client's first render disagree. This module
 * is the alternative `useSyncExternalStore` was built for — the server says
 * "no choice yet", the client says what is actually stored, and React reconciles
 * the difference without a cascading render.
 *
 * It also gives two behaviours a component-local `useState` cannot: the theme
 * follows a live system preference change, and two open tabs stay in agreement.
 */

import { useSyncExternalStore } from 'react';
import {
  readPreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type Theme,
} from './theme';

export type ThemePreference = Theme | 'system';

type Listener = () => void;

const DARK_QUERY = '(prefers-color-scheme: dark)';
const listeners = new Set<Listener>();

const hasWindow = (): boolean => typeof window !== 'undefined';

/**
 * The media query handle, created on first use.
 *
 * Not at module scope: this module is imported before anything has installed a
 * `matchMedia`, and a handle captured too early is permanently the wrong one.
 *
 * The memo is keyed on the identity of `window.matchMedia`, so a replaced
 * implementation — a test stub, a polyfill loaded late — yields a fresh handle
 * instead of one wired to a listener nobody is holding any more.
 */
let queryFactory: unknown;
let query: MediaQueryList | null = null;

function darkQuery(): MediaQueryList | null {
  const factory = hasWindow() ? window.matchMedia : undefined;
  if (factory !== queryFactory) {
    queryFactory = factory;
    query = typeof factory === 'function' ? factory(DARK_QUERY) : null;
  }
  return query;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);

  if (listeners.size === 1) {
    // First subscriber: start listening to the two things that can change the
    // answer without anyone touching this tab.
    darkQuery()?.addEventListener('change', onSystemChange);
    if (hasWindow()) window.addEventListener('storage', onStorageChange);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      darkQuery()?.removeEventListener('change', onSystemChange);
      if (hasWindow()) window.removeEventListener('storage', onStorageChange);
    }
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

function onSystemChange(event: MediaQueryListEvent): void {
  // Only meaningful while nobody has chosen for themselves; the snapshot read
  // below is what decides, so this is just a nudge to re-read.
  if (readPreference() === 'system') notify();
  else void event;
}

function onStorageChange(event: StorageEvent): void {
  // Another tab changed the choice; adopt it rather than disagreeing with it.
  if (event.key !== THEME_STORAGE_KEY) return;
  notify();
}

/** What the person chose: `light`, `dark`, or "follow the system". */
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, readPreference, getServerPreferenceSnapshot);
}

/** The theme actually in force, with `system` already resolved. */
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribe, getResolvedSnapshot, getServerResolvedSnapshot);
}

/**
 * Snapshots are read fresh on every call rather than cached.
 *
 * `localStorage` is the source of truth, and a cache would go stale the moment a
 * value was written by hand, by another tab, or by a previous test. Reading is a
 * `localStorage` read plus a `matchMedia` read; both are cheap, and returning a
 * primitive keeps `useSyncExternalStore`'s comparison stable.
 */
function getResolvedSnapshot(): ResolvedTheme {
  return resolveTheme(readPreference());
}

function getServerPreferenceSnapshot(): ThemePreference {
  // A server that rendered no JavaScript has no stored choice and no system
  // preference to consult.
  return 'system';
}

function getServerResolvedSnapshot(): ResolvedTheme {
  return 'light';
}

/**
 * Record a choice. Writing storage is the source of truth; the notification only
 * exists so this tab redraws too.
 */
export function setThemePreference(preference: ThemePreference): void {
  if (!hasWindow()) return;
  if (preference === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
  else window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  notify();
}
