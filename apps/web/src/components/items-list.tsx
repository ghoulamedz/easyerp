'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import type { Item } from '@easyerp/contracts';
import { translatorFor, type Locale } from '../i18n/config';
import { useCollection, type CollectionQuery } from '../lib/use-collection';
import { useHasPermission } from '../lib/use-permissions';
import { FilterBar } from './filter-bar';

export function ItemsList({ locale }: { locale: Locale }) {
  const t = translatorFor(locale);
  const searchParams = useSearchParams();
  const [q, setQ] = useState(() => searchParams.get('q') ?? '');
  const [itemType, setItemType] = useState(() => searchParams.get('itemType') ?? '');

  const result = useCollection<Item>('/items', {
    ...(q ? { q } : {}),
    ...(itemType ? { itemType } : {}),
  });
  const canCreate = useHasPermission('item:create');

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

  const items = result.data.items;

  if (items.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-ink-muted">{t('noItems')}</p>
        {canCreate ? (
          <Link href={`/${locale}/items/new`} className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:bg-surface-sunken">
            {t('addFirstItem')}
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <FilterBar
        locale={locale}
        q={q}
        onQChange={setQ}
        itemType={itemType}
        onItemTypeChange={setItemType}
        showSearch={true}
        showItemType={true}
        searchPlaceholder="filter"
      />
      {canCreate ? (
        <div className="mb-4 flex justify-end">
          <Link href={`/${locale}/items/new`} className="inline-flex items-center justify-center gap-2 rounded-lg border border-transparent bg-brand px-3.5 py-2 text-sm font-medium text-brand-contrast hover:bg-brand-hover">
            {t('newItem')}
          </Link>
        </div>
      ) : null}
      <div className="divide-y divide-line">
        {items.map((item) => (
          <div key={item.id} className="py-4">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <div>
                <p className="font-medium text-ink">{item.name}</p>
                <p className="text-sm text-ink-muted">{item.code}</p>
                {item.description ? (
                  <p className="text-sm text-ink-muted line-clamp-2">{item.description}</p>
                ) : null}
              </div>
              <div className="text-sm text-ink-muted">
                <p className="mb-1">{t('item')}</p>
                <p className="font-medium">{item.itemType}</p>
              </div>
              <div className="text-sm text-ink-muted">
                <p className="mb-1">{t('amount')}</p>
                <p className="font-medium text-success">{item.salePrice}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}