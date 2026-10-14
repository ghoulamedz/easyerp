'use client';

/**
 * Edit Tax Rate form.
 *
 * Loads an existing Tax Rate and allows changing its properties.
 * A rate is a row with effective dates, never a literal in code.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { TaxRateRecord } from '@easyerp/contracts';
import { apiGet, apiSend } from '../lib/api';
import { translatorFor, type Locale } from '../i18n/config';
import { Button, Card, CardBody } from './ui';
import { IconAlert } from './icons';

const FIELD =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none';

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-ink-muted">
      {children}
    </label>
  );
}

export function TaxRateEditForm({ locale, id }: { locale: Locale; id: string }) {
  const t = translatorFor(locale);
  const router = useRouter();

  const [code, setCode] = useState('');
  const [rate, setRate] = useState('');
  const [activeFrom, setActiveFrom] = useState('');
  const [activeTo, setActiveTo] = useState('');
  const [loadingRate, setLoadingRate] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // There is no GET /settings/tax-rates/:id: the list is the read surface,
    // so the row is picked out of it.
    apiGet<unknown>('/settings/tax-rates')
      .then((data) => {
        if (cancelled) return;
        const rows = Array.isArray(data)
          ? (data as readonly TaxRateRecord[])
          : ((data as { items?: readonly TaxRateRecord[] }).items ?? []);
        const rateRecord = rows.find((row) => row.id === id);
        if (!rateRecord) throw new Error(t('loadFailed'));
        setCode(rateRecord.code);
        setRate(rateRecord.rate);
        setActiveFrom(rateRecord.activeFrom);
        setActiveTo(rateRecord.activeTo ?? '');
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t('loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoadingRate(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      await apiSend(`/settings/tax-rates/${id}`, 'PATCH', {
        code: code.trim(),
        rate: rate.trim(),
        activeFrom,
        activeTo: activeTo === '' ? null : activeTo,
      });
      router.push(`/${locale}/settings/tax-rates`);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('loadFailed'));
    } finally {
      setWorking(false);
    }
  };

  if (loadingRate) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-ink-muted">{t('loading')}</p>
        </CardBody>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardBody>
          <p role="alert" className="flex items-start gap-2 text-sm text-danger">
            <IconAlert className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="taxrate-code">{t('partyCode')}</Label>
              <input
                id="taxrate-code"
                required
                maxLength={32}
                dir="ltr"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={FIELD}
              />
            </div>
            <div>
              <Label htmlFor="taxrate-rate">{t('itemTaxRate')}</Label>
              <input
                id="taxrate-rate"
                required
                dir="ltr"
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className={FIELD}
              />
            </div>
            <div>
              <Label htmlFor="taxrate-from">{t('taxActiveFrom')}</Label>
              <input
                id="taxrate-from"
                type="date"
                required
                dir="ltr"
                value={activeFrom}
                onChange={(e) => setActiveFrom(e.target.value)}
                className={FIELD}
              />
            </div>
            <div>
              <Label htmlFor="taxrate-to">{t('taxActiveTo')}</Label>
              <input
                id="taxrate-to"
                type="date"
                dir="ltr"
                value={activeTo}
                onChange={(e) => setActiveTo(e.target.value)}
                className={FIELD}
              />
            </div>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}

          <Button type="submit" variant="primary" disabled={working}>
            {working ? t('formSaving') : t('formSave')}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}