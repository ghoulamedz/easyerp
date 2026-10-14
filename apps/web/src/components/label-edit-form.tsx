'use client';

/**
 * Edit Label form.
 *
 * Loads an existing Label and allows changing its value.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { LOCALES } from '@easyerp/contracts';
import type { LabelRecord } from '@easyerp/contracts';
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

export function LabelEditForm({
  locale,
  entityType,
  entityCode,
  labelLocale,
}: {
  locale: Locale;
  entityType: string;
  entityCode: string;
  labelLocale: string;
}) {
  const t = translatorFor(locale);
  const router = useRouter();

  const [value, setValue] = useState('');
  const [loadingLabel, setLoadingLabel] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<LabelRecord>(`/settings/labels?entityType=${entityType}&entityCode=${entityCode}&locale=${labelLocale}`)
      .then((data) => {
        if (cancelled) return;
        const labels = Array.isArray(data) ? data : (data as { items?: LabelRecord[] }).items ?? [];
        if (labels.length > 0) {
          setValue(labels[0].value);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t('loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoadingLabel(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityCode, labelLocale]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      await apiSend('/settings/labels', 'PUT', {
        entityType,
        entityCode,
        locale: labelLocale,
        value: value.trim() === '' ? null : value.trim(),
      });
      router.push(`/${locale}/settings/labels`);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('loadFailed'));
    } finally {
      setWorking(false);
    }
  };

  function labelTypeKey(type: string): string {
    return type === 'DOCUMENT' ? t('labelTypeDocument') : t('labelTypeTaxRate');
  }

  if (loadingLabel) {
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
              <Label htmlFor="label-entity-type">{t('labelEntityType')}</Label>
              <input
                id="label-entity-type"
                value={labelTypeKey(entityType)}
                readOnly
                className={`${FIELD} bg-surface-sunken`}
              />
            </div>
            <div>
              <Label htmlFor="label-entity-code">{t('labelEntityCode')}</Label>
              <input
                id="label-entity-code"
                value={entityCode}
                readOnly
                className={`${FIELD} bg-surface-sunken`}
              />
            </div>
            <div>
              <Label htmlFor="label-locale">{t('labelLocale')}</Label>
              <input
                id="label-locale"
                value={labelLocale.toUpperCase()}
                readOnly
                className={`${FIELD} bg-surface-sunken`}
              />
            </div>
            <div>
              <Label htmlFor="label-value">{t('labelValue')}</Label>
              <input
                id="label-value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
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