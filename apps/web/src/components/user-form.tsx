'use client';

/**
 * New User form.
 *
 * Direct creation, no invite email: one deployment serves one Business, so the
 * Administrator creates the account with its role here. The password is hashed
 * server-side and never travels back.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Role } from '@easyerp/contracts';
import { apiGet, apiSend } from '../lib/api';
import { translatorFor, type Locale } from '../i18n/config';
import { Button, Card, CardBody } from './ui';
import { IconAlert } from './icons';

const FIELD =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none';

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-ink-muted">
      {children}
    </label>
  );
}

export function UserForm({ locale }: { locale: Locale }) {
  const t = translatorFor(locale);
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [roleIds, setRoleIds] = useState<readonly string[]>([]);
  const [roles, setRoles] = useState<readonly Role[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<unknown>('/roles')
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data)
          ? (data as readonly Role[])
          : ((data as { items?: readonly Role[] }).items ?? []);
        setRoles(list);
        const admin = list.find((r) => r.code === 'ADMINISTRATOR');
        if (list.length === 1 && list[0]) setRoleIds([list[0].id]);
        else if (admin) setRoleIds([]);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t('loadFailed'));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleRole = (id: string): void => {
    setRoleIds((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      await apiSend('/users', 'POST', {
        email: email.trim(),
        displayName: displayName.trim(),
        password,
        roleIds: [...roleIds],
        isActive: true,
      });
      router.push(`/${locale}/settings/users`);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('loadFailed'));
      // Re-enable only when the write failed. On success the screen is leaving,
      // and clearing the flag while Next navigates is what made the button
      // clickable again mid-navigation — a second click then posts twice.
      setWorking(false);
    }
  };

  return (
    <Card>
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="user-email">{t('setupAdminEmail')}</Label>
              <input
                id="user-email"
                type="email"
                required
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={FIELD}
              />
            </div>
            <div>
              <Label htmlFor="user-name">{t('setupAdminName')}</Label>
              <input
                id="user-name"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={FIELD}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="user-password">{t('setupAdminPassword')}</Label>
              <input
                id="user-password"
                type="password"
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={FIELD}
              />
            </div>
            <div className="sm:col-span-2">
              <span className="mb-1.5 block text-xs font-medium text-ink-muted">
                {t('userRoles')}
              </span>
              <div className="flex flex-wrap gap-4">
                {roles.map((role) => (
                  <label key={role.id} className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={roleIds.includes(role.id)}
                      onChange={() => toggleRole(role.id)}
                    />
                    {role.name}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {error ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-danger">
              <IconAlert className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.push(`/${locale}/settings/users`);
                router.refresh();
              }}
              className="w-full"
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={working || roleIds.length === 0}
              className="w-full"
            >
              {working ? t('formCreating') : t('formCreate')}
          </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
