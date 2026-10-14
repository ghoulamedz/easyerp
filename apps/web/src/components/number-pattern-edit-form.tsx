'use client';

/**
 * Edit Number Pattern form.
 *
 * Loads an existing Number Pattern and allows changing its properties.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { NumberPatternRecord } from '@easyerp/contracts';
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

export function NumberPatternEditForm({ locale, code }: { locale: Locale; code: string }) {
  const t = translatorFor(locale);
  const router = useRouter();

  const [pattern, setPattern] = useState('');
  const [padding, setPadding] = useState('');
  const [loadingPattern, setLoadingPattern] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<NumberPatternRecord>(`/settings/number-patterns/${code}`)
      .then((np) => {
        if (cancelled) return;
        setPattern(np.pattern);
        setPadding(String(np.padding));
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t('loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoadingPattern(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      await apiSend(`/settings/number-patterns/${code}`, 'PUT', {
        pattern: pattern.trim(),
        padding: Number(padding),
      });
      router.push(`/${locale}/settings/number-patterns`);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('loadFailed'));
    } finally {
      setWorking(false);
    }
  };

  if (loadingPattern) {
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
              <Label htmlFor="np-code">{t('numberPatternCode')}</Label>
              <input
                id="np-code"
                required
                maxLength={32}
                dir="ltr"
                value={code}
                readOnly
                className={`${FIELD} bg-surface-sunken`}
              />
            </div>
            <div>
              <Label htmlFor="np-pattern">{t('numberPatternPattern')}</Label>
              <input
                id="np-pattern"
                required
                maxLength={64}
                dir="ltr"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                className={FIELD}
              />
            </div>
            <div>
              <Label htmlFor="np-padding">{t('numberPatternPadding')}</Label>
              <input
                id="np-padding"
                required
                type="number"
                min="1"
                max="10"
                dir="ltr"
                value={padding}
                onChange={(e) => setPadding(e.target.value)}
                className={FIELD}
              />
            </div>
          </div>

          {error ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-danger">
              <IconAlert className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          ) : null}

          <Button type="submit" variant="primary" disabled={working} className="w-full">
            {working ? t('formSaving') : t('formSave')}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}