'use client';

/**
 * Edit Sales Order form.
 *
 * Loads an existing Draft order and allows changing the customer and lines.
 * The server re-prices every line from the Items on every mutation (ADR 0005).
 * Issuing happens from the list, never here.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { BusinessProfile, Item, Party, SalesOrder } from '@easyerp/contracts';
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
  description: string;
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

export function SalesOrderEditForm({ locale, id }: { locale: Locale; id: string }) {
  const t = translatorFor(locale);
  const router = useRouter();

  const [businessId, setBusinessId] = useState('');
  const [partyId, setPartyId] = useState('');
  const [parties, setParties] = useState<readonly Party[]>([]);
  const [items, setItems] = useState<readonly Item[]>([]);
  const [lines, setLines] = useState<LineRow[]>([{ key: 'line-1', itemId: '', quantity: '1', description: '' }]);

  const [loadingRefs, setLoadingRefs] = useState(true);
  const [loadingOrder, setLoadingOrder] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiGet<BusinessProfile>('/settings/business'),
      apiGet<unknown>('/parties'),
      apiGet<unknown>('/items'),
      apiGet<SalesOrder>(`/sales/orders/${id}`),
    ])
      .then(([profile, p, i, order]) => {
        if (cancelled) return;
        setBusinessId(profile.id);
        const customers = asArray<Party>(p).filter((party) => party.roles.includes('CUSTOMER'));
        const stocked = asArray<Item>(i);
        setParties(customers);
        setItems(stocked);

        if (order.status !== 'DRAFT') {
          setError(t('editOnlyDraft'));
          return;
        }

        setPartyId(order.partyId);
        setLines(
          order.lines.length > 0
            ? order.lines.map((line, index) => ({
                key: rowKey(),
                itemId: line.itemId,
                quantity: line.quantity,
                description: line.description ?? '',
              }))
            : [{ key: rowKey(), itemId: stocked[0]?.id ?? '', quantity: '1', description: '' }],
        );
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t('loadFailed'));
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingRefs(false);
          setLoadingOrder(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      await apiSend(`/sales/orders/${id}`, 'PATCH', {
        partyId,
        lines: lines
          .filter((line) => line.itemId !== '')
          .map((line) => ({
            itemId: line.itemId,
            quantity: line.quantity.trim(),
            ...(line.description.trim() === '' ? {} : { description: line.description.trim() }),
          })),
      });
      router.push(`/${locale}/sales-orders`);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('loadFailed'));
    } finally {
      setWorking(false);
    }
  };

  if (loadingRefs || loadingOrder) {
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
          <div>
            <Label htmlFor="order-party">{t('customer')}</Label>
            <select
              id="order-party"
              required
              value={partyId}
              onChange={(e) => setPartyId(e.target.value)}
              className={FIELD}
            >
              {parties.map((party) => (
                <option key={party.id} value={party.id}>
                  {party.name} ({party.code})
                </option>
              ))}
            </select>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-ink">{t('invoiceLines')}</legend>
            {lines.map((line) => (
              <div key={line.key} className="flex flex-wrap items-end gap-2">
                <div className="min-w-40 flex-1">
                  <Label htmlFor={`line-item-${line.key}`}>{t('item')}</Label>
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
                <div className="min-w-40 flex-1">
                  <Label htmlFor={`line-desc-${line.key}`}>{t('itemDescription')}</Label>
                  <input
                    id={`line-desc-${line.key}`}
                    value={line.description}
                    onChange={(e) =>
                      setLines(lines.map((l) => (l.key === line.key ? { ...l, description: e.target.value } : l)))
                    }
                    className={FIELD}
                  />
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
                  { key: rowKey(), itemId: items[0]?.id ?? '', quantity: '1', description: '' },
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

          <Button type="submit" variant="primary" disabled={working} className="w-full">
            {working ? t('formSaving') : t('formSave')}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}