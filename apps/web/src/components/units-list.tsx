'use client';

import Link from 'next/link';
import type { UnitRecord } from '@easyerp/contracts';
import { translatorFor, type Locale } from '../i18n/config';
import { useCollection } from '../lib/use-collection';
import { useHasPermission } from '../lib/use-permissions';

export function UnitsList({ locale }: { locale: Locale }) {
  const t = translatorFor(locale);
  const result = useCollection<UnitRecord>('/settings/units');
  const canCreate = useHasPermission('unit:create');

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
        <p className="text-sm text-ink-muted">{t('noUnits')}</p>
        {canCreate ? (
          <Link href={`/${locale}/settings/units/new`} className="btn btn-outline mt-4 inline-block">
            {t('addFirstUnit')}
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      {canCreate ? (
        <div className="mb-4 flex justify-end">
          <Link href={`/${locale}/settings/units/new`} className="btn btn-primary">
            {t('newUnit')}
          </Link>
        </div>
      ) : null}
      <div className="divide-y divide-line">
        {rows.map((unit) => (
          <div key={unit.id} className="py-4">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <div>
                <p className="font-medium text-ink">{unit.code}</p>
              </div>
              <div className="text-sm text-ink-muted">
                <p className="mb-1">{t('unitAllowsFraction')}</p>
                <p className="font-medium">{unit.allowsFraction ? t('yes') : t('no')}</p>
              </div>
              <div className="text-sm text-ink-muted">
                <p className="mb-1">{t('unitActive')}</p>
                <p className="font-medium">{unit.isActive ? t('yes') : t('no')}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}