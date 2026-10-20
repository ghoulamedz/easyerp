'use client';

/**
 * New Goods Receipt form (standalone, or fulfilling a Purchase Order).
 *
 * A receipt names the Supplier (optional) and the lines; money never travels
 * (ADR 0005) — the server prices every line from the Items. Picking an order
 * prefills its lines in full and locks the supplier to the order's party.
 * The receipt is
 * created and issued in one call (`POST /purchasing/receipts`), so there is no
 * separate issue step from the list: an issued receipt is immutable.
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
  purchaseOrderLineId: string | null;
}

interface PurchaseOrderDetailLine {
  readonly id: string;
  readonly itemId: string;
  readonly quantity: string;
  readonly description?: string | null;
}

interface PurchaseOrderDetail {
  readonly id: string;
  readonly partyId?: string | null;
  readonly party?: { readonly id: string } | null;
  readonly lines: readonly PurchaseOrderDetailLine[];
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

export function GoodsReceiptForm({ locale }: { locale: Locale }) {
  const t = translatorFor(locale);
  const router = useRouter();

  const [businessId, setBusinessId] = useState('');
  const [partyId, setPartyId] = useState('');
  const [parties, setParties] = useState<readonly Party[]>([]);
  const [items, setItems] = useState<readonly Item[]>([]);
  const [orders, setOrders] = useState<readonly DocumentSummary[]>([]);
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [lines, setLines] = useState<LineRow[]>([
    { key: 'line-1', itemId: '', quantity: '1', description: '', purchaseOrderLineId: null },
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
      apiGet<unknown>('/purchasing/orders'),
    ])
      .then(([profile, p, i, o]) => {
        if (cancelled) return;
        setBusinessId(profile.id);
        const suppliers = asArray<Party>(p).filter((party) => party.roles.includes('SUPPLIER'));
        const stocked = asArray<Item>(i);
        setParties(suppliers);
        setItems(stocked);
        // A receipt records what arrived against the promise: an order line
        // carries no received analogue, so Draft and Issued orders both list
        // and every linked line prefills its full ordered quantity.
        setOrders(
          asArray<DocumentSummary>(o).filter((order) => order.status === 'DRAFT' || order.status === 'ISSUED'),
        );
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
    if (purchaseOrderId === '') return;
    let cancelled = false;
    apiGet<PurchaseOrderDetail>(`/purchasing/orders/${purchaseOrderId}`)
      .then((detail) => {
        if (cancelled) return;
        const orderParty = detail.party?.id ?? detail.partyId ?? '';
        if (orderParty !== '') setPartyId(orderParty);
        setLines(
          detail.lines.length > 0
            ? detail.lines.map((line) => ({
                key: rowKey(),
                itemId: line.itemId,
                quantity: line.quantity,
                description: line.description ?? '',
                purchaseOrderLineId: line.id,
              }))
            : [
                {
                  key: rowKey(),
                  itemId: items[0]?.id ?? '',
                  quantity: '1',
                  description: '',
                  purchaseOrderLineId: null,
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
  }, [purchaseOrderId]);

  const onPickOrder = (next: string): void => {
    setPurchaseOrderId(next);
    if (next === '') {
      // Back to standalone: the link ids leave with the order.
      setLines([
        {
          key: rowKey(),
          itemId: items[0]?.id ?? '',
          quantity: '1',
          description: '',
          purchaseOrderLineId: null,
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
      await apiSend('/purchasing/receipts', 'POST', {
        businessId,
        ...(partyId === '' ? {} : { partyId }),
        ...(purchaseOrderId === '' ? {} : { purchaseOrderId }),
        lines: lines
          .filter((line) => line.itemId !== '')
          .map((line) => ({
            itemId: line.itemId,
            quantity: line.quantity.trim(),
            ...(line.description.trim() === '' ? {} : { description: line.description.trim() }),
            ...(line.purchaseOrderLineId ? { purchaseOrderLineId: line.purchaseOrderLineId } : {}),
          })),
      });
      router.push(`/${locale}/purchasing/receipts`);
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
            <Label htmlFor="receipt-order">{t('linkOrder')}</Label>
            <select
              id="receipt-order"
              value={purchaseOrderId}
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
            <Label htmlFor="receipt-party">{t('roleSupplier')}</Label>
            <select
              id="receipt-party"
              value={partyId}
              disabled={purchaseOrderId !== ''}
              onChange={(e) => setPartyId(e.target.value)}
              className={FIELD}
            >
              <option value="">—</option>
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
                    purchaseOrderLineId: null,
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
