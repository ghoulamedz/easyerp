'use client';

/**
 * Customer Invoice form — unified for create and edit.
 *
 * A draft names the Customer, the document language and the lines; amounts, taxes
 * and totals are resolved server-side (ADR 0005) and the number is assigned at
 * issue, never here (ADR 0006). An invoice that priced itself could quote a total
 * the Business never computed.
 *
 * Create (no `id`): `POST /sales/invoices`. Edit (`id`): `PATCH
 * /sales/invoices/:id`, which the API accepts for a Draft only — an Issued invoice
 * is immutable in the service *and* by database trigger, and is corrected by a
 * Credit Note (ADR 0006, ADR 0018).
 *
 * `businessId` travels on the create body and never on the patch: the strict update
 * schema would refuse it, because which Business a document belongs to is not a
 * field an edit may move.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { BusinessProfile, CustomerInvoice, Item, Party } from '@easyerp/contracts';
import { apiGet, apiSend } from '../lib/api';
import { translatorFor, type Locale } from '../i18n/config';
import { Button, Card, CardBody } from './ui';
import { IconAlert } from './icons';

const FIELD =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none';

/** The languages a document can be printed in (ADR 0009). */
const DOCUMENT_LOCALES = ['fr', 'en', 'ar'] as const;

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

export function CustomerInvoiceUnifiedForm({
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
  const [documentLocale, setDocumentLocale] = useState<string>(locale);
  const [parties, setParties] = useState<readonly Party[]>([]);
  const [items, setItems] = useState<readonly Item[]>([]);
  const [lines, setLines] = useState<LineRow[]>([
    { key: 'line-1', itemId: '', quantity: '1', description: '' },
  ]);

  const [loadingRefs, setLoadingRefs] = useState(true);
  const [loadingInvoice, setLoadingInvoice] = useState(Boolean(id));
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missingRefs = parties.length === 0 || items.length === 0;
  const isEdit = Boolean(id);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      apiGet<BusinessProfile>('/settings/business'),
      apiGet<unknown>('/parties'),
      apiGet<unknown>('/items'),
      id ? apiGet<CustomerInvoice>(`/sales/invoices/${id}`) : Promise.resolve(null),
    ])
      .then(([profile, p, i, invoice]) => {
        if (cancelled) return;
        setBusinessId(profile.id);
        const customers = asArray<Party>(p).filter((party) => party.roles.includes('CUSTOMER'));
        const stocked = asArray<Item>(i);
        setParties(customers);
        setItems(stocked);

        if (invoice && invoice.status !== 'DRAFT') {
          setError(t('editOnlyDraft'));
          setLoadingRefs(false);
          return;
        }

        if (invoice) {
          setPartyId(invoice.partyId);
          setDocumentLocale(invoice.locale);
          setLines(
            invoice.lines.length > 0
              ? invoice.lines.map((line) => ({
                  key: rowKey(),
                  itemId: line.itemId,
                  quantity: line.quantity,
                  description: line.description ?? '',
                }))
              : [{ key: 'line-1', itemId: stocked[0]?.id ?? '', quantity: '1', description: '' }],
          );
        } else if (customers.length > 0) {
          const first = customers[0]!;
          const firstItem = stocked[0];
          setPartyId(first.id);
          setLines((prev) =>
            prev.map((line, index) =>
              index === 0 && line.itemId === '' ? { ...line, itemId: firstItem?.id ?? '' } : line,
            ),
          );
        }
        setLoadingRefs(false);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t('loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoadingInvoice(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, locale, t]);

  const onSubmit = async (event: FormEvent, action: 'save' | 'issue'): Promise<void> => {
    event.preventDefault();
    setError(null);
    setWorking(true);

    const pricedLines = lines
      .filter((line) => line.itemId !== '')
      .map((line) => ({
        itemId: line.itemId,
        quantity: line.quantity.trim(),
        ...(line.description.trim() === '' ? {} : { description: line.description.trim() }),
      }));

    const patch = { partyId, locale: documentLocale, lines: pricedLines };

    try {
      // `apiSend` throws an `ApiError` already localized from the server's
      // `{ error: { code, message } }`; a refusal reaches the reader verbatim.
      const saved = id
        ? await apiSend<CustomerInvoice>(`/sales/invoices/${id}`, 'PATCH', patch)
        : await apiSend<CustomerInvoice>('/sales/invoices', 'POST', {
            businessId,
            ...patch,
          });

      if (action === 'issue') {
        await apiSend(`/sales/invoices/${saved.id}/issue`, 'POST');
      }

      router.push(`/${locale}/customer-invoices`);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('saveFailed'));
      // Re-enable only when the write failed. On success the screen is leaving,
      // and clearing the flag while Next navigates is what made the button
      // clickable again mid-navigation — a second click then posts twice.
      setWorking(false);
    }
  };

  if (loadingRefs || loadingInvoice) {
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

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="invoice-party">{t('customer')}</Label>
              <select
                id="invoice-party"
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
            <div>
              <Label htmlFor="invoice-locale">{t('locale')}</Label>
              <select
                id="invoice-locale"
                value={documentLocale}
                onChange={(e) => setDocumentLocale(e.target.value)}
                className={FIELD}
              >
                {DOCUMENT_LOCALES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
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

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.push(`/${locale}/customer-invoices`);
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
