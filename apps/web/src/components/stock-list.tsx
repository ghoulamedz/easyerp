'use client';

import { useEffect, useState } from 'react';
import type { StockPositionListItem } from '@easyerp/contracts';
import { translatorFor, type Locale } from '../i18n/config';
import { ApiError, apiGet } from '../lib/api';

type State =
  | { readonly state: 'loading' }
  | { readonly state: 'failed'; readonly error: ApiError }
  | { readonly state: 'ready'; readonly rows: readonly StockPositionListItem[] };

export function StockList({ locale }: { locale: Locale }) {
  const t = translatorFor(locale);
  const [result, setResult] = useState<State>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    apiGet<readonly StockPositionListItem[]>('/inventory/stock').then(
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
    return <p className="py-8 text-center text-sm text-ink-muted">{t('noItems')}</p>;
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <a href="/api/inventory/stock.csv" className="btn btn-secondary">
          {t('stockExportCsv')}
        </a>
      </div>
      <div className="divide-y divide-line">
        {result.rows.map((row) => (
          <div key={row.itemId} className="py-4">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
              <div>
                <p className="font-medium text-ink">{row.name}</p>
                <p className="text-sm text-ink-muted">{row.code}</p>
              </div>
              <div className="text-sm text-ink-muted">
                <p className="mb-1">{t('onHand')}</p>
                <p className="font-medium">{row.onHand}</p>
              </div>
              <div className="text-sm text-ink-muted">
                <p className="mb-1">{t('available')}</p>
                <p className="font-medium text-success">{row.available}</p>
              </div>
              <div className="text-sm text-ink-muted">
                <p className="mb-1">{t('reserved')}</p>
                <p className="font-medium">{row.reserved}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
