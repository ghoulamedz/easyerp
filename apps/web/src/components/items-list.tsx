'use client';

import Link from 'next/link';
import type { Item } from '@easyerp/contracts';
import { translatorFor, type Locale } from '../i18n/config';
import { useCollection } from '../lib/use-collection';
import { useHasPermission } from '../lib/use-permissions';

export function ItemsList({ locale }: { locale: Locale }) {
  const t = translatorFor(locale);
  const result = useCollection<Item>('/items');
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
          <Link href={`/${locale}/items/new`} className="btn btn-outline mt-4 inline-block">
            {t('addFirstItem')}
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      {canCreate ? (
        <div className="mb-4 flex justify-end">
          <Link href={`/${locale}/items/new`} className="btn btn-primary">
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
