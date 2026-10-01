'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LOCALES, type Locale } from '../i18n/config';
import { IconGlobe } from './icons';
import { cx } from './ui';

/**
 * Locale switcher.
 *
 * It rewrites the first path segment and keeps the rest of the URL, so switching
 * language inside `/ar/permissions` lands on `/fr/permissions` rather than
 * dumping the user on the dashboard. `dir` flips server-side on the next render,
 * which is why the choice is a navigation and not a client-side flag.
 */
export function LocaleSwitcher({ locale, label }: { locale: Locale; label: string }) {
  const pathname = usePathname();
  const router = useRouter();

  const swap = (target: Locale): void => {
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length > 0) segments[0] = target;
    router.push(`/${segments.join('/')}`);
  };

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface-sunken p-0.5">
      <IconGlobe className="ms-2 size-4 shrink-0 text-ink-subtle" />
      <span className="sr-only">{label}</span>
      {LOCALES.map((candidate) => {
        const current = candidate === locale;
        return (
          <Link
            key={candidate}
            href={`/${candidate}`}
            hrefLang={candidate}
            lang={candidate}
            aria-current={current ? 'true' : undefined}
            onClick={(event) => {
              // Let modified clicks behave like ordinary links.
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
              event.preventDefault();
              swap(candidate);
            }}
            className={cx(
              'rounded-md px-2 py-1 text-xs font-medium transition-colors duration-150',
              current ? 'bg-surface-raised text-ink shadow-xs' : 'text-ink-subtle hover:text-ink',
            )}
          >
            {candidate.toUpperCase()}
          </Link>
        );
      })}
    </div>
  );
}
