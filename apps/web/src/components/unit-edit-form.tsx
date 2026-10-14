'use client';

/**
 * Edit Unit form.
 *
 * Loads an existing Unit and allows changing its properties.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { UnitRecord } from '@easyerp/contracts';
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

export function UnitEditForm({ locale, id }: { locale: Locale; id: string }) {
  const t = translatorFor(locale);
  const router = useRouter();

  const [code, setCode] = useState('');
  const [allowsFraction, setAllowsFraction] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const [loadingUnit, setLoadingUnit] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<UnitRecord>(`/settings/units/${id}`)
      .then((unit) => {
        if (cancelled) return;
        setCode(unit.code);
        setAllowsFraction(unit.allowsFraction);
        setIsActive(unit.isActive);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t('loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoadingUnit(false);
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
      await apiSend(`/settings/units/${id}`, 'PATCH', {
        code: code.trim(),
        allowsFraction,
        isActive,
      });
      router.push(`/${locale}/settings/units`);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('loadFailed'));
    } finally {
      setWorking(false);
    }
  };

  if (loadingUnit) {
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
              <Label htmlFor="unit-code">{t('unitCode')}</Label>
              <input
                id="unit-code"
                required
                maxLength={8}
                dir="ltr"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={FIELD}
              />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={allowsFraction}
                  onChange={(e) => setAllowsFraction(e.target.checked)}
                />
                {t('unitAllowsFraction')}
              </label>
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                {t('formActive')}
              </label>
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