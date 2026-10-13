'use client';

import Link from 'next/link';
import type { User } from '@easyerp/contracts';
import { translatorFor, type Locale } from '../i18n/config';
import { useCollection } from '../lib/use-collection';
import { useHasPermission } from '../lib/use-permissions';

export function UsersList({ locale }: { locale: Locale }) {
  const t = translatorFor(locale);
  const result = useCollection<User>('/users');
  const canCreate = useHasPermission('user:create');

  if (result.state === 'loading') {
    return <p className="py-8 text-center text-sm text-ink-muted">{t('loading')}</p>;
  }

  if (result.state === 'failed') {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-ink-muted">{t('loadFailed')}</p>
        <p className="mt-1 text-sm text-ink-muted">{t('tryAgainOrContactSupport')}</p>
      </div>
    );
  }

  const rows = result.data.items;

  if (rows.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-ink-muted">{t('noUsers')}</p>
        {canCreate ? (
          <Link href={`/${locale}/settings/users/new`} className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:bg-surface-sunken">
            {t('addFirstUser')}
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      {canCreate ? (
        <div className="mb-4 flex justify-end">
          <Link href={`/${locale}/settings/users/new`} className="inline-flex items-center justify-center gap-2 rounded-lg border border-transparent bg-brand px-3.5 py-2 text-sm font-medium text-brand-contrast hover:bg-brand-hover">
            {t('newUser')}
          </Link>
        </div>
      ) : null}
      <div className="divide-y divide-line">
        {rows.map((user) => (
          <div key={user.id} className="py-4">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <div>
                <p className="font-medium text-ink">{user.displayName}</p>
                <p className="text-sm text-ink-muted">{user.email}</p>
              </div>
              <div className="text-sm text-ink-muted">
                <p className="mb-1">{t('userActive')}</p>
                <p className="font-medium">{user.isActive ? t('yes') : t('no')}</p>
              </div>
              <div className="text-sm text-ink-muted">
                <p className="mb-1">{t('userRoles')}</p>
                <p className="font-medium">
                  {user.roles.map((r) => r.name).join(', ') || '—'}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}