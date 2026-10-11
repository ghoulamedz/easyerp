'use client';

import Link from 'next/link';
import type { NumberPatternRecord } from '@easyerp/contracts';
import { translatorFor, type Locale } from '../i18n/config';
import { useCollection } from '../lib/use-collection';
import { useHasPermission } from '../lib/use-permissions';

export function NumberPatternsList({ locale }: { locale: Locale }) {
  const t = translatorFor(locale);
  const result = useCollection<NumberPatternRecord>('/settings/number-patterns');
  const canManage = useHasPermission('number-series:manage');

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
        <p className="text-sm text-ink-muted">{t('noNumberPatterns')}</p>
        {canManage ? (
          <Link href={`/${locale}/settings/number-patterns/new`} className="btn btn-outline mt-4 inline-block">
            {t('addFirstNumberPattern')}
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      {canManage ? (
        <div className="mb-4 flex justify-end">
          <Link href={`/${locale}/settings/number-patterns/new`} className="btn btn-primary">
            {t('newNumberPattern')}
          </Link>
        </div>
      ) : null}
      <div className="divide-y divide-line">
        {rows.map((np) => (
          <div key={np.code} className="py-4">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <div>
                <p className="font-medium text-ink">{np.code}</p>
              </div>
              <div className="text-sm text-ink-muted">
                <p className="mb-1">{t('numberPatternPattern')}</p>
                <p className="font-medium font-mono">{np.pattern}</p>
              </div>
              <div className="text-sm text-ink-muted">
                <p className="mb-1">{t('numberPatternPadding')}</p>
                <p className="font-medium">{np.padding}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}