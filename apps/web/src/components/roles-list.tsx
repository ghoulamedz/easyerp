'use client';

import Link from 'next/link';
import type { Role } from '@easyerp/contracts';
import { translatorFor, type Locale } from '../i18n/config';
import { useCollection } from '../lib/use-collection';
import { useHasPermission } from '../lib/use-permissions';

export function RolesList({ locale }: { locale: Locale }) {
  const t = translatorFor(locale);
  const result = useCollection<Role>('/roles');
  const canCreate = useHasPermission('role:create');

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
        <p className="text-sm text-ink-muted">{t('noRoles')}</p>
        {canCreate ? (
          <Link href={`/${locale}/settings/roles/new`} className="btn btn-outline mt-4 inline-block">
            {t('addFirstRole')}
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      {canCreate ? (
        <div className="mb-4 flex justify-end">
          <Link href={`/${locale}/settings/roles/new`} className="btn btn-primary">
            {t('newRole')}
          </Link>
        </div>
      ) : null}
      <div className="divide-y divide-line">
        {rows.map((role) => (
          <div key={role.id} className="py-4">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <div>
                <p className="font-medium text-ink">{role.name}</p>
                <p className="text-sm text-ink-muted">{role.code}</p>
              </div>
              <div className="text-sm text-ink-muted">
                <p className="mb-1">{t('rolePermissions')}</p>
                <p className="font-medium text-ink-muted">{role.permissions.length} {t('permissionsCount')}</p>
              </div>
              <div className="text-sm text-ink-muted">
                <p className="mb-1">{t('roleProtected')}</p>
                <p className="font-medium">{role.isProtected ? t('yes') : t('no')}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}