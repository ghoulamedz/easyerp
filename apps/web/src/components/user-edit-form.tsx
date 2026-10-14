'use client';

/**
 * Edit User form.
 *
 * Loads an existing User and allows changing their properties.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Role, User } from '@easyerp/contracts';
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

export function UserEditForm({ locale, id }: { locale: Locale; id: string }) {
  const t = translatorFor(locale);
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [roleIds, setRoleIds] = useState<readonly string[]>([]);
  const [roles, setRoles] = useState<readonly Role[]>([]);
  const [isActive, setIsActive] = useState(true);

  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // There is no GET /users/:id: the list is the read surface, so the row
    // is picked out of it. Identity edits (email, name, password) have no
    // update route — this form owns roles and active status only.
    Promise.all([apiGet<unknown>('/users'), apiGet<unknown>('/roles')])
      .then(([usersData, rolesData]) => {
        if (cancelled) return;
        const users = Array.isArray(usersData)
          ? (usersData as readonly User[])
          : ((usersData as { items?: readonly User[] }).items ?? []);
        const user = users.find((row) => row.id === id);
        if (!user) throw new Error(t('loadFailed'));
        setEmail(user.email);
        setDisplayName(user.displayName);
        setRoleIds(user.roles.map((r) => r.id));
        setIsActive(user.isActive);

        const roleList = Array.isArray(rolesData)
          ? (rolesData as readonly Role[])
          : ((rolesData as { items?: readonly Role[] }).items ?? []);
        setRoles(roleList);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t('loadFailed'));
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingUser(false);
          setLoadingRoles(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const toggleRole = (roleId: string): void => {
    setRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((r) => r !== roleId) : [...prev, roleId],
    );
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      // Roles and active status are the whole update surface: identity
      // fields have no update route and render read-only above.
      await apiSend(`/users/${id}/roles`, 'PATCH', { roleIds: [...roleIds] });
      await apiSend(`/users/${id}/active`, 'PATCH', { isActive });
      router.push(`/${locale}/settings/users`);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('loadFailed'));
    } finally {
      setWorking(false);
    }
  };

  if (loadingUser || loadingRoles) {
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
              <Label htmlFor="user-email">{t('setupAdminEmail')}</Label>
              <input
                id="user-email"
                type="email"
                dir="ltr"
                value={email}
                readOnly
                className={`${FIELD} bg-surface-sunken`}
              />
            </div>
            <div>
              <Label htmlFor="user-name">{t('setupAdminName')}</Label>
              <input
                id="user-name"
                value={displayName}
                readOnly
                className={`${FIELD} bg-surface-sunken`}
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
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                {t('formActive')}
              </label>
            </div>
          </div>

          {error ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-danger">
              <IconAlert className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            disabled={working || roleIds.length === 0}
            className="w-full"
          >
            {working ? t('formSaving') : t('formSave')}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}