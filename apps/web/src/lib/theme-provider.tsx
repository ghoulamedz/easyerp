'use client';

/**
 * The one global source of truth for night/day mode.
 *
 * Deliberately minimal: it publishes the preference and the resolved theme, and
 * keeps `<html>` in step with them. A provider that also owned the sidebar, the
 * router or the data would be a provider nobody could reason about.
 *
 * The reading and the storing live in `theme-store`; this file is the part the
 * interface consumes. That split is why there is no `useState` here at all —
 * see the note on the store about hydration.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { applyTheme, type ResolvedTheme, type Theme } from './theme';
import {
  setThemePreference,
  useResolvedTheme,
  useThemePreference,
  type ThemePreference,
} from './theme-store';

interface ThemeContextValue {
  /** What is on screen right now. */
  readonly theme: ResolvedTheme;
  /** What the user chose, which may be `system`. */
  readonly preference: ThemePreference;
  readonly setPreference: (preference: ThemePreference) => void;
  readonly toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useThemePreference();
  const theme = useResolvedTheme();
  const isMounted = useRef(false);

  // On mount, sync the theme class with what the bootstrap script applied.
  // The bootstrap script in <head> runs before hydration and may have applied
  // a theme class. If React's initial render (server snapshot: light) differs
  // from the bootstrap script's choice (e.g. dark), we correct it immediately.
  // Also re-applies when the resolved theme changes (user or system preference).
  useEffect(() => {
    isMounted.current = true;
    applyTheme(theme);
  }, [theme]);

  const setPreference = useCallback((next: ThemePreference) => {
    setThemePreference(next);
  }, []);

  const toggle = useCallback(() => {
    // A person clicking the switch is asserting a preference, not asking for the
    // system default: `system` collapses to whatever is the opposite of what is
    // currently on screen.
    setThemePreference(theme === 'dark' ? 'light' : 'dark');
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, preference, setPreference, toggle }),
    [theme, preference, setPreference, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>');
  return context;
}

export type { Theme, ThemePreference };