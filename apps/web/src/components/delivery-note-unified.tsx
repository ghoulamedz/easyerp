'use client';

/**
 * Delivery Note form — unified for create and edit.
 *
 * A note either fulfils an issued Sales Order or stands alone. When it fulfils one,
 * picking the order prefills the lines with what is still open — the quantities
 * promised but not yet shipped — because those are the only lines a note against
 * that order may carry.
 *
 * Create (no `id`): `POST /sales/delivery-notes`. Edit (`id`): `PATCH
 * /sales/delivery-notes/:id`.
 *
 * On an edit the fulfilled order is **shown and not chosen**. It is the document's
 * identity — the server refuses a patch that moves it, and a note that changed the
 * order it ships would leave its lines pointing at another order's lines. The
 * recipient stays editable, except that a note fulfilling an order must ship to that
 * order's Customer, which the server enforces and this screen mirrors by disabling
 * the select.
 *
 * Issuing is what moves stock and releases Reservations; a draft edit moves neither
 * (ADR 0004).
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type {
  BusinessProfile,
  DeliveryNote,
  DocumentSummary,
  Item,
  Party,
} from '@easyerp/contracts';
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

function emptyLine(itemId: string): LineRow {
  return { key: rowKey(), itemId, quantity: '1', description: '', salesOrderLineId: null };
}

export function DeliveryNoteUnifiedForm({ locale, id }: { locale: Locale; id?: string }) {
  const t = translatorFor(locale);
  const router = useRouter();

  const [businessId, setBusinessId] = useState('');
  const [partyId, setPartyId] = useState('');
  const [parties, setParties] = useState<readonly Party[]>([]);
  const [items, setItems] = useState<readonly Item[]>([]);
  const [orders, setOrders] = useState<readonly DocumentSummary[]>([]);
  const [salesOrderId, setSalesOrderId] = useState('');
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [lines, setLines] = useState<LineRow[]>([emptyLine('')]);

  const [loadingRefs, setLoadingRefs] = useState(true);
  const [loadingNote, setLoadingNote] = useState(Boolean(id));
  const [loadingLines, setLoadingLines] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = Boolean(id);
  const missingRefs = parties.length === 0 || items.length === 0;

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      apiGet<BusinessProfile>('/settings/business'),
      apiGet<unknown>('/parties'),
      apiGet<unknown>('/items'),
      apiGet<unknown>('/sales/orders'),
      id ? apiGet<DeliveryNote>(`/sales/delivery-notes/${id}`) : Promise.resolve(null),
    ])
      .then(([profile, p, i, o, note]) => {
        if (cancelled) return;
        setBusinessId(profile.id);
        const customers = asArray<Party>(p).filter((party) => party.roles.includes('CUSTOMER'));
        const stocked = asArray<Item>(i);
        setParties(customers);
        setItems(stocked);
        // Only an issued order can be shipped against: reservations are created
        // at issue, so only issued orders have reservable lines.
        setOrders(asArray<DocumentSummary>(o).filter((order) => order.status === 'ISSUED'));

        if (note && note.status !== 'DRAFT') {
          setError(t('editOnlyDraft'));
          setLoadingRefs(false);
          return;
        }

        if (note) {
          setPartyId(note.party?.id ?? '');
          setSalesOrderId(note.salesOrderId ?? '');
          setLines(
            note.lines.length > 0
              ? note.lines.map((line) => ({
                  key: rowKey(),
                  itemId: line.itemId,
                  quantity: line.quantity,
                  description: line.description,
                  salesOrderLineId: line.salesOrderLineId,
                }))
              : [emptyLine(stocked[0]?.id ?? '')],
          );
        } else if (customers.length > 0) {
          const first = customers[0]!;
          const firstItem = stocked[0];
          setPartyId(first.id);
          setLines([emptyLine(firstItem?.id ?? '')]);
        }
        setLoadingRefs(false);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t('loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoadingNote(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, locale, t]);

  // Picking an order (a create-time choice only) prefills what is still open.
  useEffect(() => {
    if (salesOrderId === '') return;
    let cancelled = false;
    apiGet<SalesOrderDetail>(`/sales/orders/${salesOrderId}`)
      .then((detail) => {
        if (cancelled) return;
        setPartyId(detail.partyId);
        setOrderNumber(
          orders.find((order) => order.id === salesOrderId)?.number ?? null,
        );
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
        setLines(open.length > 0 ? open : [emptyLine(items[0]?.id ?? '')]);
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
  }, [salesOrderId, items, orders]);

  const onPickOrder = (next: string): void => {
    setSalesOrderId(next);
    if (next === '') {
      // Back to standalone: the link ids leave with the order.
      setLines([emptyLine(items[0]?.id ?? '')]);
      setOrderNumber(null);
    } else {
      setLoadingLines(true);
    }
  };

  const onSubmit = async (event: FormEvent, action: 'save' | 'issue'): Promise<void> => {
    event.preventDefault();
    setError(null);
    setWorking(true);

    const payload = {
      partyId,
      lines: lines
        .filter((line) => line.itemId !== '')
        .map((line) => ({
          itemId: line.itemId,
          quantity: line.quantity.trim(),
          ...(line.description.trim() === '' ? {} : { description: line.description.trim() }),
          ...(line.salesOrderLineId ? { salesOrderLineId: line.salesOrderLineId } : {}),
        })),
    };

    try {
      const saved = id
        ? await apiSend<DeliveryNote>(`/sales/delivery-notes/${id}`, 'PATCH', payload)
        : await apiSend<DeliveryNote>('/sales/delivery-notes', 'POST', {
            businessId,
            // The order link is a create-time decision; a patch that moved it is
            // refused, because the lines below name that order's lines.
            ...(salesOrderId === '' ? {} : { salesOrderId }),
            ...payload,
          });

      if (action === 'issue') {
        await apiSend(`/sales/delivery-notes/${saved.id}/issue`, 'POST');
      }

      router.push(`/${locale}/delivery-notes`);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('saveFailed'));
      // Re-enable only when the write failed. On success the screen is leaving,
      // and clearing the flag while Next navigates is what made the button
      // clickable again mid-navigation — a second click then posts twice.
      setWorking(false);
    }
  };

  if (loadingRefs || loadingNote) {
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
        <form className="space-y-4">
          {missingRefs ? (
            <div className="rounded-lg border border-line bg-surface-sunken p-3 text-sm text-ink-muted">
              {parties.length === 0 && items.length === 0
                ? t('createCustomerAndItemFirst')
                : parties.length === 0
                  ? t('createCustomerFirst')
                  : t('createItemFirst')}
            </div>
          ) : null}

          <div>
            <Label htmlFor="note-order">{t('linkOrder')}</Label>
            {isEdit ? (
              // The order a note fulfils is its identity, not a field: the server
              // refuses a patch that moves it.
              <p className="text-sm text-ink" id="note-order">
                {salesOrderId === '' ? '—' : (orderNumber ?? salesOrderId)}
              </p>
            ) : (
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
            )}
          </div>

          {loadingLines ? <p className="text-sm text-ink-muted">{t('loading')}</p> : null}

          <div>
            <Label htmlFor="note-party">{t('customer')}</Label>
            <select
              id="note-party"
              required
              disabled={salesOrderId !== '' || parties.length === 0}
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
                    disabled={items.length === 0}
                    value={line.itemId}
                    onChange={(e) =>
                      setLines(
                        lines.map((l) => (l.key === line.key ? { ...l, itemId: e.target.value } : l)),
                      )
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
                      setLines(
                        lines.map((l) => (l.key === line.key ? { ...l, quantity: e.target.value } : l)),
                      )
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
                      setLines(
                        lines.map((l) => (l.key === line.key ? { ...l, description: e.target.value } : l)),
                      )
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
              onClick={() => setLines([...lines, emptyLine(items[0]?.id ?? '')])}
            >
              {t('orderAddLine')}
            </Button>
          </fieldset>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.push(`/${locale}/delivery-notes`);
                router.refresh();
              }}
              className="w-full sm:w-auto"
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={working || missingRefs}
              onClick={(e) => void onSubmit(e, 'save')}
              className="w-full sm:w-auto"
            >
              {working ? t('formSaving') : isEdit ? t('formSave') : t('formCreate')}
            </Button>
            <Button
              type="submit"
              variant="secondary"
              disabled={working || !isEdit || missingRefs}
              onClick={(e) => void onSubmit(e, 'issue')}
              className="w-full sm:w-auto"
            >
              {working ? t('formIssuing') : t('formIssue')}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
