'use client';

/**
 * The Settings hub.
 *
 * Seven settings screens exist as their own routes — Units, Tax Rates, Number
 * Patterns, Modules, Terminology, Users, Roles — and until this component linked to
 * them, **nothing did**. The rail pointed at `/settings` alone, and that page showed
 * Appearance, Language and Business, so every one of those screens was reachable only
 * by typing its URL. A screen nobody can navigate to is a screen that does not exist
 * for the person paying for it.
 *
 * The list is built from the routes the app actually has, and each entry carries the
 * permission its API route requires, so a session that may not read Roles is not
 * offered a link that answers 403.
 */

import Link from 'next/link';
import { translatorFor, type Locale, type MessageKey } from '../i18n/config';
import { usePermissions } from '../lib/use-permissions';

interface SettingsEntry {
  readonly key: string;
  readonly href: string;
  readonly title: MessageKey;
  readonly description: MessageKey;
  /**
   * The permission the screen's **own API route** requires — read from
   * `settings.controller.ts`, not guessed. The first draft of this list guessed
   * `business-settings:read` for every entry, which is wrong three times over: Tax
   * Rates answer on `tax-rate:manage`, Number Patterns on `number-series:manage` and
   * Terminology on `terminology:manage`. A wrong guess here is a link that 403s, so
   * `settings-nav.test.ts` reads the controller and fails on any disagreement.
   */
  readonly permission?: string;
}

/** Every Settings screen, in the order a Business meets them. */
export const SETTINGS_ENTRIES: readonly SettingsEntry[] = [
  {
    key: 'modules',
    href: '/settings/modules',
    title: 'modulesTitle',
    description: 'modulesDescription',
    permission: 'business-settings:read',
  },
  {
    key: 'units',
    href: '/settings/units',
    title: 'unitsTitle',
    description: 'unitsDescription',
    permission: 'business-settings:read',
  },
  {
    key: 'tax-rates',
    href: '/settings/tax-rates',
    title: 'labelTypeTaxRate',
    description: 'setupRates',
    permission: 'tax-rate:manage',
  },
  {
    key: 'number-patterns',
    href: '/settings/number-patterns',
    title: 'numberPatternsTitle',
    description: 'numberPatternsDescription',
    permission: 'number-series:manage',
  },
  {
    key: 'labels',
    href: '/settings/labels',
    title: 'labelsTitle',
    description: 'labelsDescription',
    permission: 'terminology:manage',
  },
  {
    key: 'users',
    href: '/settings/users',
    title: 'usersTitle',
    description: 'usersDescription',
    permission: 'user:read',
  },
  {
    key: 'roles',
    href: '/settings/roles',
    title: 'rolesTitle',
    description: 'rolesDescription',
    permission: 'role:read',
  },
];

export function SettingsNav({ locale }: { locale: Locale }) {
  const t = translatorFor(locale);
  // One hook per entry would break the rules of hooks if the list ever changed
  // length, so the permissions are read once and the entries filtered from them.
  const permissions = usePermissions();

  const allowed = (permission: string | undefined): boolean =>
    permission === undefined || permissions.includes(permission);

  const entries = SETTINGS_ENTRIES.filter((entry) => allowed(entry.permission));

  return (
    <ul className="divide-y divide-line">
      {entries.map((entry) => (
        <li key={entry.key}>
          <Link
            href={`/${locale}${entry.href}`}
            className="flex items-center justify-between gap-4 py-3 transition-colors hover:text-brand"
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">{t(entry.title)}</span>
              <span className="block text-xs text-ink-muted">{t(entry.description)}</span>
            </span>
            <span aria-hidden="true" className="text-ink-subtle">
              →
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
