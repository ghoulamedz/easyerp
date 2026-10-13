'use client';

/**
 * New Delivery Note form (standalone, or fulfilling a Sales Order).
 *
 * A note may fulfil a Sales Order, but it never has to (expansion Q11): without
 * a linked order this form drafts the standalone note — recipient plus lines.
 * Picking an issued order prefills the lines still open on it (quantity minus
 * deliveredQuantity, fully-delivered lines skipped) and locks the recipient to
 * the order's customer. Stock moves only on issue, from the list, never from
 * this draft.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { BusinessProfile, DocumentSummary, Item, Party } from '@easyerp/contracts';
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
  /** The order line this row fulfils; null for a standalone row. */
  salesOrderLineId: string | null;
}

interface SalesOrderDetailLine {
  readonly id: string;
  readonly itemId: string;
  readonly quantity: string;
  readonly deliveredQuantity: string;
  readonly description?: string | null;
}

interface SalesOrderDetail {
  readonly id: string;
  readonly partyId: string;
  readonly lines: readonly SalesOrderDetailLine[];
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

/**
 * What is still open on an order line, in plain decimal form. Null when nothing
 * is open (or the figures do not parse): the caller skips the line, so a
 * fully-delivered line never prefills a zero-quantity row. Millis arithmetic,
 * never floating point, so 5.000 minus 2.000 is exactly 3.
 */
function remainingOf(quantity: string, delivered: string): string | null {
  const toMillis = (value: string): bigint | null => {
    const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
    if (!match) return null;
    const mills = BigInt(`${match[2] ?? '0'}${(match[3] ?? '').slice(0, 3).padEnd(3, '0')}`);
    return (match[1] ?? '') === '-' ? -mills : mills;
  };
  const ordered = toMillis(quantity);
  const shipped = toMillis(delivered);
  if (ordered === null || shipped === null) return null;
  const rest = ordered - shipped;
  if (rest <= 0n) return null;
  const frac = (rest % 1000n).toString().padStart(3, '0').replace(/0+$/, '');
  const whole = (rest / 1000n).toString();
  return frac === '' ? whole : `${whole}.${frac}`;
}

export function DeliveryNoteForm({ locale }: { locale: Locale }) {
  const t = translatorFor(locale);
  const router = useRouter();

  const [businessId, setBusinessId] = useState('');
  const [partyId, setPartyId] = useState('');
  const [parties, setParties] = useState<readonly Party[]>([]);
  const [items, setItems] = useState<readonly Item[]>([]);
  const [orders, setOrders] = useState<readonly DocumentSummary[]>([]);
  const [salesOrderId, setSalesOrderId] = useState('');
  const [lines, setLines] = useState<LineRow[]>([
    { key: 'line-1', itemId: '', quantity: '1', description: '', salesOrderLineId: null },
  ]);

  const [loadingRefs, setLoadingRefs] = useState(true);
  const [loadingLines, setLoadingLines] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiGet<BusinessProfile>('/settings/business'),
      apiGet<unknown>('/parties'),
      apiGet<unknown>('/items'),
      apiGet<unknown>('/sales/orders'),
    ])
      .then(([profile, p, i, o]) => {
        if (cancelled) return;
        setBusinessId(profile.id);
        const customers = asArray<Party>(p).filter((party) => party.roles.includes('CUSTOMER'));
        const stocked = asArray<Item>(i);
        setParties(customers);
        setItems(stocked);
        // Only an issued order can be shipped against: reservations are created
        // at issue, so only issued orders have reservable lines.
        setOrders(asArray<DocumentSummary>(o).filter((order) => order.status === 'ISSUED'));
        if (customers.length > 0) setPartyId(customers[0]?.id ?? '');
        setLines((prev) =>
          prev.map((line, index) =>
            index === 0 && line.itemId === '' ? { ...line, itemId: stocked[0]?.id ?? '' } : line,
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

  useEffect(() => {
    if (salesOrderId === '') return;
    let cancelled = false;
    apiGet<SalesOrderDetail>(`/sales/orders/${salesOrderId}`)
      .then((detail) => {
        if (cancelled) return;
        setPartyId(detail.partyId);
        const open = detail.lines.flatMap((line) => {
          const remaining = remainingOf(line.quantity, line.deliveredQuantity);
          if (remaining === null) return [];
          return [
            {
              key: rowKey(),
              itemId: line.itemId,
              quantity: remaining,
              description: line.description ?? '',
              salesOrderLineId: line.id,
            },
          ];
        });
        setLines(
          open.length > 0
            ? open
            : [
                {
                  key: rowKey(),
                  itemId: items[0]?.id ?? '',
                  quantity: '1',
                  description: '',
                  salesOrderLineId: null,
                },
              ],
        );
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t('loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoadingLines(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesOrderId]);

  const onPickOrder = (next: string): void => {
    setSalesOrderId(next);
    if (next === '') {
      // Back to standalone: the link ids leave with the order.
      setLines([
        {
          key: rowKey(),
          itemId: items[0]?.id ?? '',
          quantity: '1',
          description: '',
          salesOrderLineId: null,
        },
      ]);
    } else {
      setLoadingLines(true);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      await apiSend('/sales/delivery-notes', 'POST', {
        businessId,
        partyId,
        ...(salesOrderId === '' ? {} : { salesOrderId }),
        lines: lines
          .filter((line) => line.itemId !== '')
          .map((line) => ({
            itemId: line.itemId,
            quantity: line.quantity.trim(),
            ...(line.description.trim() === '' ? {} : { description: line.description.trim() }),
            ...(line.salesOrderLineId ? { salesOrderLineId: line.salesOrderLineId } : {}),
          })),
      });
      router.push(`/${locale}/delivery-notes`);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('loadFailed'));
    } finally {
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
            <Label htmlFor="note-order">{t('linkOrder')}</Label>
            <select
              id="note-order"
              value={salesOrderId}
              onChange={(e) => onPickOrder(e.target.value)}
              className={FIELD}
            >
              <option value="">—</option>
              {orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.number ?? t('statusDraft')} — {order.partyName}
                </option>
              ))}
            </select>
          </div>

          {loadingLines ? <p className="text-sm text-ink-muted">{t('loading')}</p> : null}

          <div>
            <Label htmlFor="note-party">{t('customer')}</Label>
            <select
              id="note-party"
              required
              value={partyId}
              disabled={salesOrderId !== ''}
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
                  {
                    key: rowKey(),
                    itemId: items[0]?.id ?? '',
                    quantity: '1',
                    description: '',
                    salesOrderLineId: null,
                  },
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
            {working ? t('formCreating') : t('formCreate')}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
