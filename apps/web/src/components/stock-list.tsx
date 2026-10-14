'use client';

import { useEffect, useState } from 'react';
import type { StockPositionListItem } from '@easyerp/contracts';
import { translatorFor, type Locale } from '../i18n/config';
import { ApiError, apiGet, apiSend } from '../lib/api';
import { useSession } from '../lib/client-session';
import { useHasPermission } from '../lib/use-permissions';

type State =
  | { readonly state: 'loading' }
  | { readonly state: 'failed'; readonly error: ApiError }
  | { readonly state: 'ready'; readonly rows: readonly StockPositionListItem[] };

type Dialog = { readonly mode: 'adjust'; readonly row: StockPositionListItem };

export function StockList({ locale }: { locale: Locale }) {
  const t = translatorFor(locale);
  const [result, setResult] = useState<State>({ state: 'loading' });
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const canAdjust = useHasPermission('stock:adjust');
  const { session } = useSession();

  const [quantity, setQuantity] = useState('');
  const [direction, setDirection] = useState<'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT'>('ADJUSTMENT_IN');
  const [reasonText, setReasonText] = useState('');
  const [password, setPassword] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setResult({ state: 'loading' });
    return apiGet<readonly StockPositionListItem[]>('/inventory/stock').then(
      (rows) => {
        setResult({ state: 'ready', rows });
      },
      (fetchError: unknown) => {
        setResult({
          state: 'failed',
          error:
            fetchError instanceof ApiError
              ? fetchError
              : new ApiError(0, 'REQUEST_FAILED', 'The request could not be completed'),
        });
      },
    );
  };

  useEffect(() => {
    let cancelled = false;
    apiGet<readonly StockPositionListItem[]>('/inventory/stock').then(
      (rows) => {
        if (!cancelled) setResult({ state: 'ready', rows });
      },
      (fetchError: unknown) => {
        if (!cancelled) {
          setResult({
            state: 'failed',
            error:
              fetchError instanceof ApiError
                ? fetchError
                : new ApiError(0, 'REQUEST_FAILED', 'The request could not be completed'),
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const openDialog = (next: Dialog) => {
    setDialog(next);
    setQuantity('');
    setDirection('ADJUSTMENT_IN');
    setReasonText('');
    setPassword('');
    setError(null);
    setWorking(false);
  };

  const closeDialog = () => {
    setDialog(null);
    setError(null);
    setWorking(false);
  };

  const confirm = async () => {
    if (!dialog || working) return;
    setWorking(true);
    setError(null);
    try {
      const email = session?.user.email;
      if (!email) {
        setError(t('signInError'));
        return;
      }
      // No password-verify endpoint exists: re-sign-in as the session user.
      // A 200 confirms the password; a 401 means it was wrong. Harmless
      // either way — signing in as yourself changes nothing.
      // NOTE: bare fetch, not apiSend — apiSend redirects to sign-in on 401,
      // but here a 401 is the expected wrong-password signal, not a dead session.
      const check = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      if (!check.ok) {
        setError(t('signInError'));
        return;
      }
      await apiSend('/inventory/stock/adjust', 'POST', {
        itemId: dialog.row.itemId,
        reason: direction,
        quantity,
        reasonText,
      });
      closeDialog();
      await load();
    } catch (submitError) {
      setError(
        submitError instanceof ApiError ? submitError.message : t('signInError'),
      );
    } finally {
      setWorking(false);
    }
  };

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
        <a href="/api/inventory/stock.csv" className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:bg-surface-sunken">
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
            {canAdjust ? (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => openDialog({ mode: 'adjust', row })}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-sunken"
                >
                  {t('stockAdjustAction')}
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {dialog ? (
        <div role="dialog" aria-label={dialog.row.name} className="mt-4 rounded-lg border border-line bg-surface p-4">
          <p className="font-medium text-ink">{dialog.row.name}</p>
          <div className="mt-3 space-y-3">
            <div>
              <select
                aria-label={t('stockAdjustAction')}
                value={direction}
                onChange={(event) =>
                  setDirection(event.target.value as 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT')
                }
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
              >
                <option value="ADJUSTMENT_IN">{t('stockIn')}</option>
                <option value="ADJUSTMENT_OUT">{t('stockOut')}</option>
              </select>
            </div>
            <div>
              <label htmlFor="stock-quantity" className="mb-1.5 block text-xs font-medium text-ink-muted">
                {t('quantity')}
              </label>
              <input
                id="stock-quantity"
                type="text"
                inputMode="decimal"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
              />
            </div>
            <div>
              <label htmlFor="stock-reason" className="mb-1.5 block text-xs font-medium text-ink-muted">
                {t('stockReason')}
              </label>
              <input
                id="stock-reason"
                type="text"
                value={reasonText}
                onChange={(event) => setReasonText(event.target.value)}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
              />
            </div>
            <div>
              <label htmlFor="stock-password" className="mb-1.5 block text-xs font-medium text-ink-muted">
                {t('stockPasswordConfirm')}
              </label>
              <input
                id="stock-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void confirm()}
                disabled={working}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-brand-contrast disabled:opacity-50"
              >
                {working ? t('formCreating') : t('formCreate')}
              </button>
              <button
                type="button"
                onClick={closeDialog}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:bg-surface-sunken"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
