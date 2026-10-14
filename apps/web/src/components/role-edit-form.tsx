'use client';

/**
 * Edit Role form.
 *
 * Loads an existing Role and allows changing its name and permissions.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { allPermissions } from '@easyerp/contracts';
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

export function RoleEditForm({ locale, id }: { locale: Locale; id: string }) {
  const t = translatorFor(locale);
  const router = useRouter();

  const [name, setName] = useState('');
  const [permissions, setPermissions] = useState<readonly string[]>([]);
  const [isProtected, setIsProtected] = useState(false);

  const [loadingRole, setLoadingRole] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<Role>(`/roles/${id}`)
      .then((role) => {
        if (cancelled) return;
        setName(role.name);
        setPermissions(role.permissions);
        setIsProtected(role.isProtected);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t('loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoadingRole(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const togglePermission = (perm: string): void => {
    setPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
    );
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setWorking(true)
    setError(null);
    try {
      await apiSend(`/roles/${id}/name`, 'PUT', { name: name.trim() });
      await apiSend(`/roles/${id}/permissions`, 'PUT', { permissions: [...permissions] });
      router.push(`/${locale}/settings/roles`);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('loadFailed'));
    } finally {
      setWorking(false);
    }
  };

  if (loadingRole) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-ink-muted">{t('loading')}</p>
        </CardBody>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardBody>
          <p role="alert" className="flex items-start gap-2 text-sm text-danger">
            <IconAlert className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="role-name">{t('roleName')}</Label>
              <input
                id="role-name"
                required
                maxLength={64}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isProtected}
                className={FIELD}
              />
              {isProtected && (
                <p className="mt-1 text-xs text-ink-subtle">{t('roleProtectedName')}</p>
              )}
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={isProtected}
                  disabled
                />
                {t('roleProtected')}
              </label>
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-ink">{t('rolePermissions')}</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {allPermissions.map((perm: string) => (
                <label key={perm} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={permissions.includes(perm)}
                    onChange={() => togglePermission(perm)}
                    disabled={isProtected}
                  />
                  {perm}
                </label>
              ))}
            </div>
            {isProtected && (
              <p className="text-xs text-ink-subtle">{t('roleProtectedPermissions')}</p>
            )}
          </fieldset>

          {error ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-danger">
              <IconAlert className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          ) : null}

          <Button type="submit" variant="primary" disabled={working} className="w-full">
            {working ? t('formSaving') : t('formSave')}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}