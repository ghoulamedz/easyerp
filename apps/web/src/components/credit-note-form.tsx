'use client';

/**
 * New Credit Note form.
 *
 * A correction names the Issued Invoice and how much of each of its lines to
 * reverse; the price, the tax rate and every amount stay the Invoice line's
 * stored figures (ADR 0005) — a price changed after billing must not alter the
 * correction of what was billed. Only issued invoices qualify, and a line can
 * never be overdrawn: the server refuses both.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { BusinessProfile, DocumentSummary, Item } from '@easyerp/contracts';
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

interface InvoiceLine {
  readonly id: string;
  readonly itemId: string;
  readonly description?: string | null;
  readonly quantity: string;
}

interface InvoiceDetail {
  readonly id: string;
  readonly number: string | null;
  readonly lines: readonly InvoiceLine[];
}

interface ReversalRow {
  readonly lineId: string;
  quantity: string;
}

function asArray<T>(data: unknown): readonly T[] {
  if (Array.isArray(data)) return data as readonly T[];
  if (data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)) {
    return (data as { items: readonly T[] }).items;
  }
  return [];
}

export function CreditNoteForm({ locale }: { locale: Locale }) {
  const t = translatorFor(locale);
  const router = useRouter();

  const [businessId, setBusinessId] = useState('');
  const [invoices, setInvoices] = useState<readonly DocumentSummary[]>([]);
  const [invoiceId, setInvoiceId] = useState('');
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [itemNames, setItemNames] = useState<Readonly<Record<string, string>>>({});
  const [rows, setRows] = useState<ReversalRow[]>([]);

  const [loadingRefs, setLoadingRefs] = useState(true);
  const [loadingLines, setLoadingLines] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiGet<BusinessProfile>('/settings/business'),
      apiGet<unknown>('/sales/invoices'),
      apiGet<unknown>('/items'),
    ])
      .then(([profile, v, i]) => {
        if (cancelled) return;
        setBusinessId(profile.id);
        const issued = asArray<DocumentSummary>(v).filter((doc) => doc.status === 'ISSUED');
        setInvoices(issued);
        if (issued.length > 0) setInvoiceId(issued[0]?.id ?? '');
        const names: Record<string, string> = {};
        for (const item of asArray<Item>(i)) names[item.id] = `${item.name} (${item.code})`;
        setItemNames(names);
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
    if (!invoiceId) {
      setDetail(null);
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoadingLines(true);
    apiGet<InvoiceDetail>(`/sales/invoices/${invoiceId}`)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setRows(data.lines.map((line) => ({ lineId: line.id, quantity: line.quantity })));
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
  }, [invoiceId]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      await apiSend('/credit-notes', 'POST', {
        businessId,
        invoiceId,
        lines: rows
          .filter((row) => row.quantity.trim() !== '' && row.quantity.trim() !== '0')
          .map((row) => ({ invoiceLineId: row.lineId, quantity: row.quantity.trim() })),
      });
      router.push(`/${locale}/credit-notes`);
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
            <Label htmlFor="note-invoice">{t('correctedInvoice')}</Label>
            <select
              id="note-invoice"
              required
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
              className={FIELD}
            >
              {invoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.number ?? t('statusDraft')} — {invoice.partyName}
                </option>
              ))}
            </select>
          </div>

          {loadingLines ? (
            <p className="text-sm text-ink-muted">{t('loading')}</p>
          ) : detail ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-ink">{t('creditNoteLines')}</legend>
              {detail.lines.map((line) => {
                const row = rows.find((r) => r.lineId === line.id);
                return (
                  <div key={line.id} className="flex flex-wrap items-end gap-2">
                    <div className="min-w-40 flex-1">
                      <p className="text-sm font-medium text-ink">
                        {itemNames[line.itemId] ?? line.itemId}
                      </p>
                      <p className="text-xs text-ink-subtle">
                        {t('quantity')}: {line.quantity}
                      </p>
                    </div>
                    <div className="w-28">
                      <Label htmlFor={`reverse-${line.id}`}>{t('quantity')}</Label>
                      <input
                        id={`reverse-${line.id}`}
                        required
                        dir="ltr"
                        inputMode="decimal"
                        value={row?.quantity ?? ''}
                        onChange={(e) =>
                          setRows(rows.map((r) => (r.lineId === line.id ? { ...r, quantity: e.target.value } : r)))
                        }
                        className={FIELD}
                      />
                    </div>
                  </div>
                );
              })}
            </fieldset>
          ) : null}

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
