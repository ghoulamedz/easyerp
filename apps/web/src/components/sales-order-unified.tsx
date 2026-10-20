'use client';

/**
 * Sales Order form — unified for create and edit.
 *
 * A draft names the Customer and the lines; money never travels (ADR 0005) —
 * the server prices every line from the Items and totals the order.
 *
 * Create (no `id`): POST /sales/orders → draft, then Save stays on the form,
 * Issue redirects to the list. Edit (`id` provided): PATCH /sales/orders/:id
 * (draft only), then Save stays, Issue redirects to the list.
 * Issued documents are read-only everywhere (ADR 0018): no route reaches here.
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

export function SalesOrderUnifiedForm({
  locale,
  id,
}: {
  locale: Locale;
  id?: string;
}) {
  const t = translatorFor(locale);
  const router = useRouter();

  const [businessId, setBusinessId] = useState('');
  const [partyId, setPartyId] = useState('');
  const [parties, setParties] = useState<readonly Party[]>([]);
  const [items, setItems] = useState<readonly Item[]>([]);
  const [lines, setLines] = useState<LineRow[]>([
    { key: 'line-1', itemId: '', quantity: '1', description: '' },
  ]);

  const [loadingRefs, setLoadingRefs] = useState(true);
  // Initialised from the prop: an edit has something to load, a create does not.
  // Setting this from inside the effect would be a synchronous setState in an
  // effect body — a cascading render for a value that is known before it runs.
  const [loadingOrder, setLoadingOrder] = useState(Boolean(id));
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missingRefs = parties.length === 0 || items.length === 0;

  interface LineRow {
    key: string;
    itemId: string;
    quantity: string;
    description: string;
  }

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      apiGet<BusinessProfile>('/settings/business'),
      apiGet<unknown>('/parties'),
      apiGet<unknown>('/items'),
      id ? apiGet<SalesOrder>(`/sales/orders/${id}`) : Promise.resolve(null),
    ])
      .then(([profile, p, i, order]) => {
        if (cancelled) return;
        setBusinessId(profile.id);
        const customers = asArray<Party>(p).filter((party) => party.roles.includes('CUSTOMER'));
        const stocked = asArray<Item>(i);
        setParties(customers);
        setItems(stocked);

        if (order && order.status !== 'DRAFT') {
          // An issued order is read-only everywhere (ADR 0018). The list offers no
          // Edit link for one, so reaching this is a typed URL — and the answer is
          // still a refusal, not a form whose only outcome is a 409.
          setError(t('editOnlyDraft'));
          // Clear the loading flag on the way out: returning from inside `.then`
          // skips the `setLoadingRefs(false)` at its end, and the refusal would
          // then render as a form that loads forever.
          setLoadingRefs(false);
          return;
        }

        if (order) {
          setPartyId(order.partyId);
          setLines(
            order.lines.map((line, index) => ({
              key: `line-${index}`,
              itemId: line.itemId,
              quantity: line.quantity.toString(),
              description: line.description ?? '',
            })),
          );
        } else if (!order && customers.length > 0) {
          const firstCustomer = customers[0]!;
          const firstItem = stocked[0];
          setPartyId(firstCustomer.id);
          setLines((prev) =>
            prev.map((line, index) =>
              index === 0 && line.itemId === '' ? { ...line, itemId: firstItem?.id ?? '' } : line,
            ),
          );
        }
        setLoadingRefs(false);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t('loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoadingOrder(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, locale]);

  const onSubmit = async (e: FormEvent, action: 'save' | 'issue'): Promise<void> => {
    e.preventDefault();
    setError(null);
    setWorking(true);

    const pricedLines = lines
      .filter((line) => line.itemId !== '')
      .map((line) => ({
        itemId: line.itemId,
        quantity: line.quantity.trim(),
        ...(line.description.trim() === '' ? {} : { description: line.description.trim() }),
      }));

    const payload = {
      partyId,
      lines: pricedLines,
    };

    try {
      // `apiSend` throws an `ApiError` whose message is already localized from the
      // server's `{ error: { code, message } }`. Reading `response.ok` here instead
      // would print nothing but "Save failed" for every refusal the API explains.
      const saved = id
        ? await apiSend<SalesOrder>(`/sales/orders/${id}`, 'PATCH', payload)
        : // `draftSalesOrderSchema` is a strictObject that names `businessId`; a
          // create body without it is a 422 that no screen used to explain.
          await apiSend<SalesOrder>('/sales/orders', 'POST', { businessId, ...payload });

      if (action === 'issue') {
        await apiSend(`/sales/orders/${saved.id}/issue`, 'POST');
      }

      router.push(`/${locale}/sales-orders`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveFailed'));
      // Re-enable only when the write failed. On success the screen is leaving,
      // and clearing the flag while Next navigates is what made the button
      // clickable again mid-navigation — a second click then posts twice.
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

  const isEdit = Boolean(id);

  return (
    <Card>
      <CardBody>
        <form className="space-y-4">
          <div>
            <Label htmlFor="order-party">{t('customer')}</Label>
            <select
              id="order-party"
              required
              disabled={parties.length === 0}
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
              onClick={() => {
                const first = items[0];
                setLines([
                  ...lines,
                  { key: rowKey(), itemId: first?.id ?? '', quantity: '1', description: '' },
                ]);
              }}
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
                router.push(`/${locale}/sales-orders`);
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
              {working
                ? t('formSaving')
                : isEdit
                  ? t('formSave')
                  : t('formCreate')}
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