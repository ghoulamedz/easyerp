'use client';

/**
 * New BOM form.
 *
 * A BOM names the finished Item and the first version's component lines;
 * quantities travel, money never does (ADR 0005). Creating happens in two
 * calls — the BOM shell first, then its first version — because a version
 * is immutable and dated once written.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Item, UnitRecord } from '@easyerp/contracts';
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

interface LineRow {
  key: string;
  itemId: string;
  quantity: string;
  unitOfMeasureId: string;
}

function asArray<T>(data: unknown): readonly T[] {
  if (Array.isArray(data)) return data as readonly T[];
  if (data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)) {
    return (data as { items: readonly T[] }).items;
  }
  return [];
}

function rowKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function BomForm({ locale }: { locale: Locale }) {
  const t = translatorFor(locale);
  const router = useRouter();

  const [finishedItemId, setFinishedItemId] = useState('');
  const [items, setItems] = useState<readonly Item[]>([]);
  const [units, setUnits] = useState<readonly UnitRecord[]>([]);
  const [lines, setLines] = useState<LineRow[]>([{ key: 'line-1', itemId: '', quantity: '1', unitOfMeasureId: '' }]);

  const [loadingRefs, setLoadingRefs] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiGet<unknown>('/items'), apiGet<unknown>('/settings/units')])
      .then(([i, u]) => {
        if (cancelled) return;
        const stocked = asArray<Item>(i);
        const measures = asArray<UnitRecord>(u);
        setItems(stocked);
        setUnits(measures);
        if (stocked.length > 0) setFinishedItemId(stocked[0]?.id ?? '');
        setLines((prev) =>
          prev.map((line, index) =>
            index === 0
              ? {
                  ...line,
                  itemId: line.itemId === '' ? (stocked[0]?.id ?? '') : line.itemId,
                  unitOfMeasureId: line.unitOfMeasureId === '' ? (measures[0]?.id ?? '') : line.unitOfMeasureId,
                }
              : line,
          ),
        );
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t('loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoadingRefs(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      const created = await apiSend<{ id: string }>('/production/boms', 'POST', { finishedItemId });
      await apiSend(`/production/boms/${created.id}/versions`, 'POST', {
        bomId: created.id,
        lines: lines
          .filter((line) => line.itemId !== '')
          .map((line) => ({
            itemId: line.itemId,
            quantity: line.quantity.trim(),
            unitOfMeasureId: line.unitOfMeasureId,
          })),
      });
      router.push(`/${locale}/boms`);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('loadFailed'));
      // Re-enable only when the write failed. On success the screen is leaving,
      // and clearing the flag while Next navigates is what made the button
      // clickable again mid-navigation — a second click then posts twice.
      setWorking(false);
    }
  };

  if (loadingRefs) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-ink-muted">{t('loading')}</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="bom-finished-item">{t('prodFinishedItem')}</Label>
            <select
              id="bom-finished-item"
              required
              value={finishedItemId}
              onChange={(e) => setFinishedItemId(e.target.value)}
              className={FIELD}
            >
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.code})
                </option>
              ))}
            </select>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-ink">{t('invoiceLines')}</legend>
            {lines.map((line) => (
              <div key={line.key} className="flex flex-wrap items-end gap-2">
                <div className="min-w-40 flex-1">
                  <Label htmlFor={`line-item-${line.key}`}>{t('bomComponent')}</Label>
                  <select
                    id={`line-item-${line.key}`}
                    required
                    value={line.itemId}
                    onChange={(e) =>
                      setLines(lines.map((l) => (l.key === line.key ? { ...l, itemId: e.target.value } : l)))
                    }
                    className={FIELD}
                  >
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-28">
                  <Label htmlFor={`line-qty-${line.key}`}>{t('quantity')}</Label>
                  <input
                    id={`line-qty-${line.key}`}
                    required
                    dir="ltr"
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(e) =>
                      setLines(lines.map((l) => (l.key === line.key ? { ...l, quantity: e.target.value } : l)))
                    }
                    className={FIELD}
                  />
                </div>
                <div className="w-36">
                  <Label htmlFor={`line-unit-${line.key}`}>{t('itemBaseUnit')}</Label>
                  <select
                    id={`line-unit-${line.key}`}
                    required
                    value={line.unitOfMeasureId}
                    onChange={(e) =>
                      setLines(lines.map((l) => (l.key === line.key ? { ...l, unitOfMeasureId: e.target.value } : l)))
                    }
                    className={FIELD}
                  >
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.code}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={lines.length === 1}
                  onClick={() => setLines(lines.filter((l) => l.key !== line.key))}
                >
                  {t('setupRemove')}
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setLines([
                  ...lines,
                  { key: rowKey(), itemId: items[0]?.id ?? '', quantity: '1', unitOfMeasureId: units[0]?.id ?? '' },
                ])
              }
            >
              {t('orderAddLine')}
            </Button>
          </fieldset>

          {error ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-danger">
              <IconAlert className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.push(`/${locale}/boms`);
                router.refresh();
              }}
              className="w-full"
            >
              {t('cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={working} className="w-full">
              {working ? t('formCreating') : t('formCreate')}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
