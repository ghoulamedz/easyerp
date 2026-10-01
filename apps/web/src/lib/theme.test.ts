/**
 * @vitest-environment jsdom
 *
/**
 * The theme engine, without a browser.
 *
 * This is the logic that decides what a person sees. It is pure on purpose: the
 * class on <html>, localStorage and the system preference are all effects of
 * these functions, so they can be tested without rendering anything.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyTheme,
  isTheme,
  readPreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  THEME_BOOTSTRAP_SCRIPT,
  type Theme,
} from './theme';

function systemPrefersDark(value: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: value && query.includes('dark'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  document.documentElement.className = '';
  document.documentElement.style.colorScheme = '';
});

describe('isTheme', () => {
  it('accepts only the two real themes', () => {
    expect(isTheme('light')).toBe(true);
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('system')).toBe(false);
    expect(isTheme('DARK')).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(undefined)).toBe(false);
    expect(isTheme(1)).toBe(false);
  });
});

describe('readPreference', () => {
  it('is `system` when nothing has been chosen', () => {
    expect(readPreference()).toBe('system');
  });

  it('reads a stored choice', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(readPreference()).toBe('dark');
  });

  it('ignores a stored value that is not a theme', () => {
    // A hand-edited or stale value must not produce an unstyled page.
    window.localStorage.setItem(THEME_STORAGE_KEY, 'neon');
    expect(readPreference()).toBe('system');
  });
});

describe('resolveTheme', () => {
  it('passes an explicit choice through', () => {
    systemPrefersDark(true);
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('follows the system when nothing was chosen', () => {
    systemPrefersDark(true);
    expect(resolveTheme('system')).toBe('dark');
    systemPrefersDark(false);
    expect(resolveTheme('system')).toBe('light');
  });
});

describe('applyTheme', () => {
  it('adds the dark class only for the dark theme', () => {
    applyTheme('dark');
    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');

    applyTheme('light');
    expect(document.documentElement).not.toHaveClass('dark');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('is the only thing that writes the class, so it cannot be left half-applied', () => {
    applyTheme('light');
    applyTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});

describe('THEME_BOOTSTRAP_SCRIPT', () => {
  /** Run the script the way the browser does, and report what it did to <html>. */
  function run(): void {
    new Function(THEME_BOOTSTRAP_SCRIPT)();
  }

  beforeEach(() => {
    document.documentElement.className = '';
    document.documentElement.style.colorScheme = '';
  });

  it('picks the system preference when nothing is stored', () => {
    systemPrefersDark(true);
    run();
    expect(document.documentElement).toHaveClass('dark');
  });

  it('lets a stored choice beat the system preference', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    systemPrefersDark(true);
    run();
    expect(document.documentElement).not.toHaveClass('dark');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('applies a stored dark choice on a light machine', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    systemPrefersDark(false);
    run();
    expect(document.documentElement).toHaveClass('dark');
  });

  it('survives a browser where localStorage throws', () => {
    // Private browsing and locked-down profiles do this. A theme failure must
    // never take the application down with it.
    systemPrefersDark(false);
    const storage = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => run()).not.toThrow();
    storage.mockRestore();
  });

  it('survives a browser with no matchMedia at all', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(() => run()).not.toThrow();
  });

  it('writes nothing to the document besides the class and colour scheme', () => {
    systemPrefersDark(false);
    const before = document.body.innerHTML;
    run();
    expect(document.body.innerHTML).toBe(before);
  });
});

describe('storage contract', () => {
  it('namespaces the key, so it cannot collide with another app on the same origin', () => {
    expect(THEME_STORAGE_KEY).toBe('easyerp.theme');
  });

  it('round-trips both themes', () => {
    for (const theme of ['light', 'dark'] as Theme[]) {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
      expect(readPreference()).toBe(theme);
    }
  });
});
