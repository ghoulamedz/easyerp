'use client';

/**
 * The sign-in screen.
 *
 * It lives in the client layer because it renders `ThemeSwitch` and
 * `LocaleSwitcher`, which need the translator. A Server Component cannot hand a
 * function across that boundary, so the page composes this instead of passing
 * `t` down. Being a client component does not make it client-only: Next still
 * prerenders this markup to HTML.
 */

import { ThemeSwitch } from './theme-switch';
import { LocaleSwitcher } from './locale-switcher';
import { SignInForm } from './sign-in-form';
import { translatorFor, type Locale } from '../i18n/config';

export function SignInScreen({ locale }: { locale: Locale }) {
  const t = translatorFor(locale);

  return (
    <div className="grid min-h-dvh bg-surface lg:grid-cols-2">
      {/* A calm panel rather than a marketing page: an ERP sign-in should say
          what it is and nothing more. */}
      <div className="relative hidden flex-col justify-between border-e border-line bg-surface-raised p-10 lg:flex">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid size-9 place-items-center rounded-lg bg-brand text-sm font-bold text-brand-contrast"
          >
            eE
          </span>
          <span className="text-sm font-semibold text-ink">{t('appName')}</span>
        </div>

        <div className="max-w-md">
          <p className="text-2xl font-semibold tracking-tight text-ink">{t('tagline')}</p>
          <p className="mt-3 text-sm text-ink-muted">{t('signInIntro')}</p>
        </div>

        <div className="flex items-center gap-2 text-xs text-ink-subtle">
          <span className="tabular">ADR 0007</span>
          <span aria-hidden="true">·</span>
          <span>Better Auth</span>
        </div>
      </div>

      <div className="flex flex-col">
        <div className="flex items-center justify-end gap-2 px-4 py-3 sm:px-6">
          <ThemeSwitch t={t} compact />
          <LocaleSwitcher locale={locale} label={t('localeLabel')} />
        </div>

        <div className="flex flex-1 items-center justify-center px-4 py-10">
          <SignInForm locale={locale} />
        </div>
      </div>
    </div>
  );
}
