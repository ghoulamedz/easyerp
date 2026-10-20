'use client';

/**
 * The shell.
 *
 * Client-side because it has to know the current path to highlight the active
 * navigation entry. It is still server-rendered: `usePathname` returns the path
 * during SSR, so a deep link to `/ar/permissions` paints the whole frame —
 * navigation, theme switch, locale switch — before any JavaScript runs.
 */

import { useCallback, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AppNav, navItemsFor } from './app-nav';
import { LocaleSwitcher } from './locale-switcher';
import { MobileNav } from './mobile-nav';
import { ThemeSwitch } from './theme-switch';
import { isNavVisible, useModuleStates } from '../lib/use-modules';
import { forgetSession } from '../lib/client-session';
import { translatorFor, type Locale } from '../i18n/config';
import { IconLogout } from './icons';

export function AppShell({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const t = translatorFor(locale);
  const currentPath = usePathname();
  const moduleStates = useModuleStates();
  const [signOutFailed, setSignOutFailed] = useState(false);

  // A failed sign-out must say so: silently staying signed in while the person
  // walks away is worse than an error line next to the button.
  const handleSignOut = useCallback(async (): Promise<void> => {
    setSignOutFailed(false);
    try {
      const response = await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' });
      if (!response.ok) {
        setSignOutFailed(true);
        return;
      }
      forgetSession();
      window.location.href = `/${locale}/sign-in`;
    } catch {
      setSignOutFailed(true);
    }
  }, [locale]);
  const items = navItemsFor(t, locale).filter((item) => isNavVisible(item.key, moduleStates));
  const active = items.find(
    (item) => currentPath === item.href || currentPath.startsWith(`${item.href}/`),
  );
  const heading = active?.label ?? t('appName');

  return (
    <div className="min-h-dvh bg-surface">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:ms-4 focus:mt-4 focus:rounded-lg focus:bg-brand focus:px-3 focus:py-2 focus:text-sm focus:text-brand-contrast"
      >
        {t('navSkipToContent')}
      </a>

      {/* The rail is `fixed` on wide screens and the column on narrow ones. Both
          use inset-inline-start, so Arabic moves it to the right for free. */}
      <aside
        className="fixed inset-block-0 inset-inline-start-0 z-30 hidden w-64 flex-col gap-6 overflow-y-auto overscroll-contain border-e border-line bg-surface-raised px-4 py-5 lg:flex lg:h-dvh"
        aria-label={t('navMain')}
      >
        <div className="flex items-center gap-2.5 px-2">
          <span
            aria-hidden="true"
            data-testid="brand-mark"
            className="grid size-9 place-items-center rounded-lg bg-brand text-sm font-bold text-brand-contrast"
          >
            eE
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{t('appName')}</p>
            <p className="truncate text-xs text-ink-subtle">{heading}</p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <AppNav items={items} currentPath={currentPath} label={t('navMain')} />
        </div>
      </aside>

      <div className="lg:ps-64">
        <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <div className="lg:hidden">
              <MobileNav locale={locale} />
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-semibold text-ink">{heading}</h1>
            </div>

            <div className="flex items-center gap-2">
              <ThemeSwitch t={t} compact />
              <LocaleSwitcher locale={locale} label={t('localeLabel')} />
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="inline-flex items-center justify-center rounded-lg px-2 py-1.5 text-sm text-ink-subtle hover:text-ink hover:bg-surface-sunken transition-colors"
                aria-label={t('navSignOut')}
                title={t('navSignOut')}
              >
                <IconLogout className="size-5" />
              </button>
              {signOutFailed ? (
                <p role="alert" className="text-xs text-danger">
                  {t('signOutFailed')}
                </p>
              ) : null}
            </div>
          </div>
        </header>

        {/* `data-testid` rather than a styling class: an end-to-end test that
            asserts on a utility class breaks whenever the design moves, and then
            gets deleted instead of fixed. */}
        <main id="main" data-testid="main-content" className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}