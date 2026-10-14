'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import type { Party } from '@easyerp/contracts';
import { translatorFor, type Locale } from '../i18n/config';
import { useCollection, type CollectionQuery } from '../lib/use-collection';
import { useHasPermission } from '../lib/use-permissions';
import { FilterBar } from './filter-bar';

export function PartiesList({ locale }: { locale: Locale }) {
  const t = translatorFor(locale);
  const searchParams = useSearchParams();
  const [q, setQ] = useState(() => searchParams.get('q') ?? '');
  const [role, setRole] = useState(() => searchParams.get('role') ?? '');

  const result = useCollection<Party>('/parties', {
    ...(q ? { q } : {}),
    ...(role ? { role } : {}),
  });
  const canCreate = useHasPermission('party:create');

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

  const parties = result.data.items;
  const hasActiveFilters = q !== '' || role !== '';
  const clearFilters = () => {
    setQ('');
    setRole('');
  };
  const filters = (
    <FilterBar
      locale={locale}
      q={q}
      onQChange={setQ}
      role={role}
      onRoleChange={setRole}
      showSearch={true}
      showRole={true}
      searchPlaceholder="filter"
      onClear={hasActiveFilters ? clearFilters : undefined}
    />
  );

  if (parties.length === 0) {
    return (
      <div>
        {filters}
        <div className="py-8 text-center">
          {hasActiveFilters ? (
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
              <p className="text-sm text-ink-muted">{t('noParties')}</p>
              {canCreate ? (
                <Link href={`/${locale}/parties/new`} className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:bg-surface-sunken">
                  {t('addFirstParty')}
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
          <Link href={`/${locale}/parties/new`} className="inline-flex items-center justify-center gap-2 rounded-lg border border-transparent bg-brand px-3.5 py-2 text-sm font-medium text-brand-contrast hover:bg-brand-hover">
            {t('newParty')}
          </Link>
        </div>
      ) : null}
      <div className="divide-y divide-line">
        {parties.map((party) => (
          <div key={party.id} className="py-4">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <div>
                <p className="font-medium text-ink">{party.name}</p>
                {party.code && (
                  <p className="text-sm text-ink-muted line-clamp-2">{party.code}</p>
                )}
              </div>
              <div className="text-sm text-ink-muted">
                <p className="mb-1">{t('party')}</p>
                <p className="font-medium">{party.roles.join(', ')}</p>
              </div>
              <div className="text-sm text-ink-muted">
                <p className="mb-1">{t('country')}</p>
                <p className="font-medium text-success">{party.countryCode}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}