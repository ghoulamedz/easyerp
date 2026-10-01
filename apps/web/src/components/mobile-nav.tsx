'use client';

/**
 * The mobile sidebar. On a phone the navigation is a disclosure, not a permanent
 * column — a 240px rail plus content leaves nothing readable in Arabic, which is
 * wider than French.
 */

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AppNav, navItemsFor } from './app-nav';
import { IconClose, IconMenu } from './icons';
import { cx } from './ui';
import { translatorFor, type Locale } from '../i18n/config';

export function MobileNav({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const t = translatorFor(locale);

  // "Open" is recorded together with the path it was opened on, so a navigation
  // closes the drawer by *derivation* rather than by an effect watching the path
  // and pushing a state change afterwards. It also closes for free on a back
  // navigation, which an effect keyed on the pathname handles only by accident.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;

  const close = useCallback(() => setOpenedOn(null), []);

  // Escape closes it, as any dialog-like surface must.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close, open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpenedOn(pathname)}
        aria-expanded={open}
        aria-controls="mobile-nav"
        className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface-raised px-2.5 py-2 text-sm text-ink transition-colors hover:bg-surface-sunken lg:hidden"
      >
        <IconMenu className="size-5" />
        <span className="sr-only sm:not-sr-only">{t('navMain')}</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label={t('close')}
            onClick={close}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
          />
          <div
            id="mobile-nav"
            role="dialog"
            aria-modal="true"
            aria-label={t('navMain')}
            className="absolute inset-block-0 inset-inline-start-0 flex w-72 max-w-[85vw] flex-col gap-4 border-e border-line bg-surface p-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-ink">{t('appName')}</span>
              <button
                type="button"
                onClick={close}
                className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-sunken hover:text-ink"
              >
                <IconClose className="size-5" />
                <span className="sr-only">{t('close')}</span>
              </button>
            </div>
            <AppNav
              items={navItemsFor(t, locale)}
              currentPath={pathname}
              label={t('navMain')}
              onNavigate={close}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
