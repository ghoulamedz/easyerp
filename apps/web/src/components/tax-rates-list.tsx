'use client';

/**
 * Tax Rates settings list.
 *
 * Mirrors the Units list: one permission (`tax-rate:manage`) gates the create
 * form and every Retire button, and a successful write remounts the body so
 * the list refetches instead of hand-editing the rows it just read. Retiring
 * is `{ isActive: false }` — a rate an issued Document was priced under keeps
 * rendering, which is why no row offers deletion.
 */

import { useState } from 'react';
import type { TaxRateRecord } from '@easyerp/contracts';
import { translatorFor, type Locale } from '../i18n/config';
import { ApiError, apiSend } from '../lib/api';
import { useCollection } from '../lib/use-collection';
import { useHasPermission } from '../lib/use-permissions';
import { TaxRateForm } from './tax-rate-form';
import { Button, SkeletonRows } from './ui';

const EMPTY_DATE = '—';

export function TaxRatesList({ locale }: { locale: Locale }) {
  // The list re-reads through the hook: bumping the key remounts the body,
  // so a successful create or retire refetches without touching the fetch core.
  const [listKey, setListKey] = useState(0);
  return <TaxRatesListBody key={listKey} locale={locale} onDone={() => setListKey((key) => key + 1)} />;
}

function TaxRatesListBody({ locale, onDone }: { locale: Locale; onDone: () => void }) {
  const t = translatorFor(locale);
  const result = useCollection<TaxRateRecord>('/settings/tax-rates');
  const canManage = useHasPermission('tax-rate:manage');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function onRetire(id: string): Promise<void> {
    setPendingId(id);
    setActionError(null);
    try {
      await apiSend(`/settings/tax-rates/${id}`, 'PATCH', { isActive: false });
      onDone();
    } catch (error) {
      setActionError(
        error instanceof ApiError || error instanceof Error ? error.message : String(error),
      );
    } finally {
      setPendingId(null);
    }
  }

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

  return (
    <div className="space-y-6">
      {canManage ? <TaxRateForm locale={locale} onCreated={onDone} /> : null}

      {actionError ? (
        <p role="alert" className="text-sm text-danger">
          {actionError}
        </p>
      ) : null}

      <div className="divide-y divide-line">
        {rows.map((row) => (
          <div key={row.id} className="py-4">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
              <div>
                <p className="font-medium text-ink">{row.code}</p>
              </div>
              <div className="text-sm text-ink-muted">
                <p className="mb-1">{t('itemTaxRate')}</p>
                <p className="font-medium">{row.rate}</p>
              </div>
              <div className="text-sm text-ink-muted">
                <p className="mb-1">{t('taxActiveFrom')}</p>
                <p className="font-medium">{row.activeFrom}</p>
              </div>
              <div className="text-sm text-ink-muted">
                <p className="mb-1">{t('taxActiveTo')}</p>
                <p className="font-medium">{row.activeTo ?? EMPTY_DATE}</p>
              </div>
              <div className="flex items-center justify-between gap-2 text-sm text-ink-muted">
                <div>
                  <p className="mb-1">{t('unitActive')}</p>
                  <p className="font-medium">{row.isActive ? t('yes') : t('no')}</p>
                </div>
                {canManage && row.isActive ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pendingId === row.id}
                    onClick={() => void onRetire(row.id)}
                  >
                    {t('taxRetire')}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
