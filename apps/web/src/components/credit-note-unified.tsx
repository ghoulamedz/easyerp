'use client';

/**
 * Credit Note form — unified for create and edit.
 *
 * A correction names the Issued Invoice and how much of each of its lines to
 * reverse; the price, the tax rate and every amount stay the Invoice line's
 * stored figures (ADR 0005) — a price changed after billing must not alter the
 * correction of what was billed. Only issued invoices qualify, and a line can
 * never be overdrawn: the server refuses both.
 *
 * Create (no `id`): `POST /credit-notes`. Edit (`id`): `PATCH /credit-notes/:id`.
 *
 * On an edit the Invoice is **shown and not chosen**: which Invoice a correction
 * belongs to is the document's identity, the patch schema has no `invoiceId`, and a
 * body carrying one is refused by name. The reversal rows are re-derived from the
 * Invoice on every save, so a second edit replaces the first instead of stacking on
 * it.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { BusinessProfile, CreditNote, DocumentSummary, Item } from '@easyerp/contracts';
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

export function CreditNoteUnifiedForm({ locale, id }: { locale: Locale; id?: string }) {
  const t = translatorFor(locale);
  const router = useRouter();

  const [businessId, setBusinessId] = useState('');
  const [invoices, setInvoices] = useState<readonly DocumentSummary[]>([]);
  const [invoiceId, setInvoiceId] = useState('');
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [itemNames, setItemNames] = useState<Readonly<Record<string, string>>>({});
  const [rows, setRows] = useState<ReversalRow[]>([]);

  const [loadingRefs, setLoadingRefs] = useState(true);
  const [loadingNote, setLoadingNote] = useState(Boolean(id));
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derived, not stored. The detail shown is the one belonging to the Invoice
  // currently selected — so a stale response for a previously picked Invoice is
  // never displayed, and the effect below has no state to clear synchronously.
  const shownDetail = detail?.id === invoiceId ? detail : null;
  const loadingLines = invoiceId !== '' && shownDetail === null;

  const isEdit = Boolean(id);
  const noInvoices = invoices.length === 0;

  // Load the reference lists, and the note itself when editing.
  useEffect(() => {
    let cancelled = false;

    Promise.all([
      apiGet<BusinessProfile>('/settings/business'),
      apiGet<unknown>('/sales/invoices'),
      apiGet<unknown>('/items'),
      id ? apiGet<CreditNote>(`/credit-notes/${id}`) : Promise.resolve(null),
    ])
      .then(([profile, v, i, note]) => {
        if (cancelled) return;
        setBusinessId(profile.id);
        const issued = asArray<DocumentSummary>(v).filter((doc) => doc.status === 'ISSUED');
        setInvoices(issued);

        const names: Record<string, string> = {};
        for (const item of asArray<Item>(i)) names[item.id] = `${item.name} (${item.code})`;
        setItemNames(names);

        if (note && note.status !== 'DRAFT') {
          setError(t('editOnlyDraft'));
          setLoadingRefs(false);
          return;
        }

        if (note) {
          setInvoiceId(note.corrected.documentId);
        } else if (issued.length > 0) {
          setInvoiceId(issued[0]?.id ?? '');
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

  // The corrected Invoice's lines. On an edit the note's own rows are looked up in
  // them, so the quantity being reversed is the stored one rather than the Invoice's.
  useEffect(() => {
    if (!invoiceId) return;
    let cancelled = false;

    Promise.all([
      apiGet<InvoiceDetail>(`/sales/invoices/${invoiceId}`),
      id ? apiGet<CreditNote>(`/credit-notes/${id}`) : Promise.resolve(null),
    ])
      .then(([invoice, note]) => {
        if (cancelled) return;
        setDetail(invoice);

        const reversed = new Map<string, string>();
        for (const line of note?.lines ?? []) {
          if (line.correctsDocumentLineId !== null) {
            // Stored negated: the magnitude is what this note reverses.
            reversed.set(line.correctsDocumentLineId, line.quantity.replace('-', ''));
          }
        }
        setRows(
          invoice.lines.map((line) => ({
            lineId: line.id,
            quantity: reversed.get(line.id) ?? line.quantity,
          })),
        );
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t('loadFailed'));
      });

    return () => {
      cancelled = true;
    };
  }, [invoiceId, id]);

  const onSubmit = async (event: FormEvent, action: 'save' | 'issue'): Promise<void> => {
    event.preventDefault();
    setError(null);
    setWorking(true);

    const lines = rows
      .filter((row) => row.quantity.trim() !== '' && row.quantity.trim() !== '0')
      .map((row) => ({ invoiceLineId: row.lineId, quantity: row.quantity.trim() }));

    try {
      const saved = id
        ? await apiSend<CreditNote>(`/credit-notes/${id}`, 'PATCH', { lines })
        : await apiSend<CreditNote>('/credit-notes', 'POST', {
            businessId,
            invoiceId,
            lines,
          });

      if (action === 'issue') {
        await apiSend(`/credit-notes/${saved.id}/issue`, 'POST');
      }

      router.push(`/${locale}/credit-notes`);
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
          {!isEdit && noInvoices ? (
            <div className="rounded-lg border border-line bg-surface-sunken p-3 text-sm text-ink-muted">
              {t('createIssuedInvoiceFirst')}
            </div>
          ) : null}

          <div>
            <Label htmlFor="note-invoice">{t('correctedInvoice')}</Label>
            {isEdit ? (
              // Which Invoice the correction belongs to is its identity: shown, not
              // choosable, and the update schema refuses a body that carries one.
              <p className="text-sm text-ink" id="note-invoice">
                {shownDetail?.number ?? invoiceId}
              </p>
            ) : (
              <select
                id="note-invoice"
                required
                disabled={noInvoices}
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
            )}
          </div>

          {loadingLines ? (
            <p className="text-sm text-ink-muted">{t('loading')}</p>
          ) : shownDetail ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-ink">{t('creditNoteLines')}</legend>
              {shownDetail.lines.map((line) => {
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
                          setRows(
                            rows.map((r) =>
                              r.lineId === line.id ? { ...r, quantity: e.target.value } : r,
                            ),
                          )
                        }
                        className={FIELD}
                      />
                    </div>
                  </div>
                );
              })}
            </fieldset>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.push(`/${locale}/credit-notes`);
                router.refresh();
              }}
              className="w-full sm:w-auto"
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={working || noInvoices}
              onClick={(e) => void onSubmit(e, 'save')}
              className="w-full sm:w-auto"
            >
              {working ? t('formSaving') : isEdit ? t('formSave') : t('formCreate')}
            </Button>
            <Button
              type="submit"
              variant="secondary"
              disabled={working || !isEdit || noInvoices}
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
