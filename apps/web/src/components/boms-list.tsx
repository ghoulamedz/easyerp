'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import type { BomSummary } from '@easyerp/contracts';
import { translatorFor, type Locale } from '../i18n/config';
import { useCollection } from '../lib/use-collection';
import { useHasPermission } from '../lib/use-permissions';
import { FilterBar } from './filter-bar';
import { SkeletonRows } from './ui';

export function BomsList({ locale }: { locale: Locale }) {
  const t = translatorFor(locale);
  const searchParams = useSearchParams();
  const [q, setQ] = useState(() => searchParams.get('q') ?? '');
  const canCreate = useHasPermission('bom:create');

  const result = useCollection<BomSummary>('/production/boms', {
    ...(q ? { q } : {}),
  });

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
  const hasActiveFilters = q !== '';
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
      searchPlaceholder="finishedItemSearch"
      onClear={hasActiveFilters ? clearFilters : undefined}
    />
  );

  if (rows.length === 0) {
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
              <p className="text-sm text-ink-muted">{t('noBoms')}</p>
              {canCreate ? (
                <Link href={`/${locale}/boms/new`} className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:bg-surface-sunken">
                  {t('addFirstBom')}
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
          <Link href={`/${locale}/boms/new`} className="inline-flex items-center justify-center gap-2 rounded-lg border border-transparent bg-brand px-3.5 py-2 text-sm font-medium text-brand-contrast hover:bg-brand-hover">
            {t('newBom')}
          </Link>
        </div>
      ) : null}
      <div className="divide-y divide-line">
        {rows.map((row) => (
          <div key={row.id} className="py-4">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <div>
                <p className="font-medium text-ink">{row.finishedItemName}</p>
                <p className="text-sm text-ink-muted">{row.finishedItemCode}</p>
              </div>
              <div className="text-sm text-ink-muted">
                <p className="mb-1">{t('bomsTitle')}</p>
                <p className="font-medium">v{row.latestVersion ?? '—'}</p>
              </div>
              <div className="text-sm text-ink-muted">
                <p className="mb-1">{t('quantity')}</p>
                <p className="font-medium">{row.versionCount}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}