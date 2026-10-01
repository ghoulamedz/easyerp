import Link from 'next/link';
import { IconGrid, IconShield, IconGear } from './icons';
import { cx } from './ui';
import type { MessageKey, Translator } from '../i18n/config';

export interface NavItem {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly icon: typeof IconGrid;
}

/**
 * Navigation is derived from the locale, not stored. One list, translated once,
 * so a new page cannot appear in one language and be missing from another.
 */
export function navItemsFor(t: Translator, locale: string): NavItem[] {
  const root = `/${locale}`;
  return [
    // The dashboard links to its canonical path, not to the locale root. Linking
    // to the root makes it a prefix of every other route, so "is this active?"
    // answers yes on every page and the navigation stops meaning anything.
    { key: 'dashboard', label: t('navDashboard'), href: `${root}/dashboard`, icon: IconGrid },
    {
      key: 'permissions',
      label: t('navPermissions'),
      href: `${root}/permissions`,
      icon: IconShield,
    },
    { key: 'settings', label: t('navSettings'), href: `${root}/settings`, icon: IconGear },
  ];
}

export function AppNav({
  items,
  currentPath,
  label,
  onNavigate,
}: {
  items: NavItem[];
  currentPath: string;
  label: string;
  /** Absent means "no drawer to close"; `undefined` means the same thing. */
  onNavigate?: (() => void) | undefined;
}) {
  return (
    <nav aria-label={label} className="flex flex-col gap-1">
      {items.map(({ key, label, href, icon: Icon }) => {
        const active = currentPath === href || currentPath.startsWith(`${href}/`);
        return (
          <Link
            key={key}
            href={href}
            {...(onNavigate ? { onClick: onNavigate } : {})}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'inline-flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150',
              active
                ? 'bg-brand-soft font-medium text-brand'
                : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
            )}
          >
            <Icon className="size-5 shrink-0" />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Re-exported so a page can add its own entry without importing the icon file. */
export type { MessageKey };
