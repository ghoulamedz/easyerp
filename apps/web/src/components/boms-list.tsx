'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { BomSummary } from '@easyerp/contracts';
import { translatorFor, type Locale } from '../i18n/config';
import { ApiError, apiGet } from '../lib/api';
import { useHasPermission } from '../lib/use-permissions';

type State =
  | { readonly state: 'loading' }
  | { readonly state: 'failed'; readonly error: ApiError }
  | { readonly state: 'ready'; readonly rows: readonly BomSummary[] };

export function BomsList({ locale }: { locale: Locale }) {
  const t = translatorFor(locale);
  const canCreate = useHasPermission('bom:create');
  const [result, setResult] = useState<State>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    apiGet<readonly BomSummary[]>('/production/boms').then(
      (rows) => {
        if (!cancelled) setResult({ state: 'ready', rows });
      },
      (error: unknown) => {
        if (!cancelled) {
          setResult({
            state: 'failed',
            error:
              error instanceof ApiError
                ? error
                : new ApiError(0, 'REQUEST_FAILED', 'The request could not be completed'),
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

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

  if (result.rows.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-ink-muted">{t('noBoms')}</p>
        {canCreate ? (
          <Link href={`/${locale}/boms/new`} className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:bg-surface-sunken">
            {t('addFirstBom')}
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      {canCreate ? (
        <div className="mb-4 flex justify-end">
          <Link href={`/${locale}/boms/new`} className="inline-flex items-center justify-center gap-2 rounded-lg border border-transparent bg-brand px-3.5 py-2 text-sm font-medium text-brand-contrast hover:bg-brand-hover">
            {t('newBom')}
          </Link>
        </div>
      ) : null}
      <div className="divide-y divide-line">
        {result.rows.map((row) => (
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
