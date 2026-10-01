/**
 * Night/day mode.
 *
 * Three states, not two: light, dark, and "follow the system". The third is the
 * default, because a person who never touches the switch should still get a
 * readable interface at 22h.
 *
 * The choice is one class on <html>. Components never read the theme and never
 * branch on it — they use the semantic tokens in `globals.css`, so the whole app
 * changes at once and nothing can forget to.
 */

export type Theme = 'light' | 'dark';
export type ThemePreference = Theme | 'system';

/** A preference with `system` already resolved, i.e. only a real theme. */
export type ResolvedTheme = Theme;

export const THEME_STORAGE_KEY = 'easyerp.theme';

export const isTheme = (value: unknown): value is Theme => value === 'light' || value === 'dark';

/**
 * Runs before the first paint, so a dark-mode user never sees a white flash.
 * Kept as a string because it is injected into the document verbatim.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{
var k=${JSON.stringify(THEME_STORAGE_KEY)};
var p=localStorage.getItem(k);
var t=(p==='light'||p==='dark')?p:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
var r=document.documentElement;
r.classList.toggle('dark',t==='dark');
r.style.colorScheme=t;
}catch(e){}})();`;

function systemTheme(): Theme {
  // `matchMedia` is absent in older browsers, in some embedded views, and in a
  // test that stubbed it away. Falling back to light is a defensible answer;
  // throwing would take the whole application down over a colour.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function readPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isTheme(stored) ? stored : 'system';
}

export function resolveTheme(preference: ThemePreference): Theme {
  return preference === 'system' ? systemTheme() : preference;
}

/** The single place the class is written, so the DOM and the state cannot drift. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}
