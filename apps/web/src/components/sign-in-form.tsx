'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, CardBody } from './ui';
import { useSession } from '../lib/client-session';
import { IconAlert, IconEye, IconEyeOff } from './icons';
import { translatorFor, type Locale } from '../i18n/config';

/**
 * Sign-in against the API's own Better Auth endpoint.
 *
 * This is the real integration, not a mock: Better Auth is mounted at
 * `/api/auth` before any body parser (ADR 0007), and this form posts to it
 * through the same origin.
 */
export function SignInForm({ locale }: { locale: Locale }) {
  const t = translatorFor(locale);
  const router = useRouter();
  const { session } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        setError(t('signInError'));
        return;
      }
      router.push(`/${locale}/dashboard`);
      router.refresh();
    } catch {
      setError(t('signInError'));
    } finally {
      setWorking(false);
    }
  };

  const field =
    'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none';

  return (
    <Card className="w-full max-w-sm">
      <CardBody className="space-y-4">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid size-9 place-items-center rounded-lg bg-brand text-sm font-bold text-brand-contrast"
          >
            eE
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">{t('signInTitle')}</p>
            <p className="text-xs text-ink-subtle">{t('signInSubtitle')}</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-ink-muted">
              {t('signInEmail')}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              dir="ltr"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={field}
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-ink-muted">
              {t('signInPassword')}
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                dir="ltr"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={field + ' pe-10'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 end-0 pe-3 flex items-center text-ink-subtle hover:text-ink"
                aria-label={showPassword ? t('hidePassword') : t('showPassword')}
              >
                {showPassword ? <IconEyeOff className="size-5" /> : <IconEye className="size-5" />}
              </button>
            </div>
          </div>

          {error ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
            >
              <IconAlert className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          ) : null}

          <Button type="submit" variant="primary" disabled={working} className="w-full">
            {working ? t('signInWorking') : t('signInSubmit')}
          </Button>
        </form>

        {/* Shown only with a session: a signed-out visitor sent to the dashboard
            would bounce straight back through the session gate, looping here. */}
        {session ? (
          <Link
            href={`/${locale}/dashboard`}
            className="block text-center text-sm text-brand underline underline-offset-4 hover:no-underline"
          >
            {t('signInBack')}
          </Link>
        ) : null}
      </CardBody>
    </Card>
  );
}
