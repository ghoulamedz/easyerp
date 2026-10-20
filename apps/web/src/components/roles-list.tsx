'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Role } from '@easyerp/contracts';
import { translatorFor, type Locale } from '../i18n/config';
import { useCollection } from '../lib/use-collection';
import { useHasPermission } from '../lib/use-permissions';
import { FilterBar } from './filter-bar';
import { SkeletonRows } from './ui';

export function RolesList({ locale }: { locale: Locale }) {
  const t = translatorFor(locale);
  const result = useCollection<Role>('/roles');
  const canCreate = useHasPermission('role:create');
  // `GET /roles` takes no query, so the search filters the fetched roles
  // client-side by name or code.
  const [q, setQ] = useState('');

  if (result.state === 'loading') {
    // A skeleton with the shape of the rows, not a line of text: the wait is real on a
    // free-tier database, and a screen that shows its layout reads as working.
    return <SkeletonRows rows={5} className="py-4" />;
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
  const needle = q.trim().toLowerCase();
  const visible =
    needle === ''
      ? rows
      : rows.filter(
          (role) =>
            role.name.toLowerCase().includes(needle) ||
            role.code.toLowerCase().includes(needle),
        );
  const clearFilters = () => {
    setQ('');
  };
  const filters = (
    <FilterBar
      locale={locale}
      q={q}
      onQChange={setQ}
      showSearch={true}
      showStatus={false}
      showItemType={false}
      showRole={false}
      searchPlaceholder="filter"
      onClear={needle !== '' ? clearFilters : undefined}
    />
  );

  if (visible.length === 0) {
    return (
      <div>
        {filters}
        <div className="py-8 text-center">
          {needle !== '' ? (
            <>
              <p className="text-sm text-ink-muted">{t('noResults')}</p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:bg-surface-sunken"
              >
                {t('clearFilters')}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-muted">{t('noRoles')}</p>
              {canCreate ? (
                <Link href={`/${locale}/settings/roles/new`} className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:bg-surface-sunken">
                  {t('addFirstRole')}
                </Link>
              ) : null}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {filters}
      {canCreate ? (
        <div className="mb-4 flex justify-end">
          <Link href={`/${locale}/settings/roles/new`} className="inline-flex items-center justify-center gap-2 rounded-lg border border-transparent bg-brand px-3.5 py-2 text-sm font-medium text-brand-contrast hover:bg-brand-hover">
            {t('newRole')}
          </Link>
        </div>
      ) : null}
      <div className="divide-y divide-line">
        {visible.map((role) => (
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