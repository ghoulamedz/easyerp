'use client';

/**
 * New Tax Rate form.
 *
 * A rate is a row with effective dates, never a literal in code: the form
 * carries code, percent rate and the applicability window, and the server
 * resolves every price and tax from the stored rows. Retiring happens on the
 * row, never here — a retired rate keeps rendering on issued Documents.
 */

import { useState, type FormEvent } from 'react';
import { apiSend } from '../lib/api';
import { translatorFor, type Locale } from '../i18n/config';
import { Button, Card, CardBody } from './ui';

const FIELD =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none';

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-ink-muted">
      {children}
    </label>
  );
}

export function TaxRateForm({ locale, onCreated }: { locale: Locale; onCreated: () => void }) {
  const t = translatorFor(locale);
  const [code, setCode] = useState('');
  const [rate, setRate] = useState('');
  const [activeFrom, setActiveFrom] = useState('');
  const [activeTo, setActiveTo] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      // An empty end date means the rate still applies; the API reads it as
      // null rather than as an empty string that is no calendar date.
      await apiSend('/settings/tax-rates', 'POST', {
        code: code.trim(),
        rate: rate.trim(),
        activeFrom,
        activeTo: activeTo === '' ? null : activeTo,
      });
      setCode('');
      setRate('');
      setActiveFrom('');
      setActiveTo('');
      onCreated();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('loadFailed'));
    } finally {
      setWorking(false);
    }
  };

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
            {working ? t('formCreating') : t('formCreate')}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
