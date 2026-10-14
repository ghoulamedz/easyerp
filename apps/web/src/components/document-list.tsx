'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { DocumentSummary, DocumentType } from '@easyerp/contracts';
import { translatorFor, type Locale, type MessageKey, format } from '../i18n/config';
import { ApiError, apiSend } from '../lib/api';
import { localizeErrorMessage, currentLocale } from '../lib/error-messages';
import { useCollection } from '../lib/use-collection';
import { useHasPermission } from '../lib/use-permissions';
import { FilterBar } from './filter-bar';

function statusKey(status: DocumentSummary['status']): MessageKey {
  switch (status) {
    case 'DRAFT':
      return 'statusDraft';
    case 'ISSUED':
      return 'statusIssued';
    case 'CANCELLED':
      return 'statusCancelled';
  }
}

/**
 * Endpoints whose controller serves `GET <endpoint>/:id/pdf` (verified: only
 * `sales/customer-invoice.controller.ts` (`sales/invoices`) and
 * `sales/credit-note.controller.ts` (`credit-notes`) declare a `:id/pdf` route;
 * the sales-order/delivery-note, purchasing and production controllers serve
 * no PDF/archive route). Drafts have no archive — `readArchive` refuses
 * anything but ISSUED — so rows hide View/Print until issued rather than
 * linking at a route that would refuse the request.
 */
const PDF_ENDPOINTS: ReadonlySet<string> = new Set(['/sales/invoices', '/credit-notes']);

function pdfHref(endpoint: string, row: DocumentSummary): string | null {
  if (!PDF_ENDPOINTS.has(endpoint)) return null;
  if (row.status !== 'ISSUED') return null;
  return `/api${endpoint}/${row.id}/pdf`;
}

export interface DocumentListProps {
  locale: Locale;
  endpoint: string;
  createPermission: string;
  newHref: string;
  newKey: MessageKey;
  addFirstKey: MessageKey;
  emptyKey: MessageKey;
  /**
   * When set, rows offer the issue transition (`POST <endpoint>/:id/issue`).
   * Only wired on pages whose API route carries the matching permission.
   */
  issuePermission?: string;
  /**
   * When set, rows offer the cancel transition (`POST <endpoint>/:id/cancel`).
   * Fiscal documents have no cancel route (ADR 0006: corrected by Credit Note),
   * so their pages leave this unset.
   */
  cancelPermission?: string;
  /**
   * When set, DRAFT rows offer an Edit link to `<editBaseHref>/<id>/edit`.
   * Only documents with an update endpoint (sales orders, purchase orders,
   * production orders) should set this.
   */
  editPermission?: string;
  editBaseHref?: string;
  /** Initial search query */
  initialQ?: string;
  /** Initial status filter */
  initialStatus?: string;
}

export function DocumentList(props: DocumentListProps) {
  // The list re-reads through the hook: bumping the key remounts the body,
  // so a successful transition refetches without touching the fetch core.
  const [listKey, setListKey] = useState(0);
  return <DocumentListBody key={listKey} {...props} onDone={() => setListKey((key) => key + 1)} />;
}

function DocumentListBody({
  locale,
  endpoint,
  createPermission,
  newHref,
  newKey,
  addFirstKey,
  emptyKey,
  issuePermission,
  cancelPermission,
  editPermission,
  editBaseHref,
  onDone,
  initialQ = '',
  initialStatus = '',
}: DocumentListProps & { onDone: () => void }) {
  const t = translatorFor(locale);
  const [q, setQ] = useState(initialQ);
  const [status, setStatus] = useState(initialStatus);

  const result = useCollection<DocumentSummary>(endpoint, {
    ...(q ? { q } : {}),
    ...(status ? { status } : {}),
  });
  const canCreate = useHasPermission(createPermission);
  // Always called (hooks order): an absent prop can never match a permission.
  const canIssue = useHasPermission(issuePermission ?? '');
  const canCancel = useHasPermission(cancelPermission ?? '');
  const canEdit = useHasPermission(editPermission ?? '');
  const showIssue = issuePermission !== undefined && canIssue;
  const showCancel = cancelPermission !== undefined && canCancel;
  const showEdit = editPermission !== undefined && canEdit && editBaseHref;
  const showActions = showIssue || showCancel || showEdit;
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const ALREADY_ISSUED_KEY: Record<DocumentType, MessageKey> = {
    SALES_ORDER: 'alreadyIssuedSalesOrder',
    DELIVERY_NOTE: 'alreadyIssuedDeliveryNote',
    CUSTOMER_INVOICE: 'alreadyIssuedCustomerInvoice',
    CREDIT_NOTE: 'alreadyIssuedCreditNote',
    PURCHASE_ORDER: 'alreadyIssuedPurchaseOrder',
    PRODUCTION_ORDER: 'alreadyIssuedProductionOrder',
    GOODS_RECEIPT: 'alreadyIssuedPurchaseOrder',
  } as const;

  function alreadyIssuedKey(type: DocumentType): MessageKey {
    return ALREADY_ISSUED_KEY[type];
  }

  function localizeAlreadyIssued(error: ApiError, row: DocumentSummary): string {
    // Server message pattern: "Type <id> is already issued as <number>. ..."
    // Extract the issued number from the message.
    const match = error.message.match(/already issued as ([^.]+)/i);
    const number = match?.[1]?.trim() ?? row.number ?? '—';
    const template = t(alreadyIssuedKey(row.type));
    return format(template, { number });
  }

  async function runAction(id: string, action: 'issue' | 'cancel'): Promise<void> {
    const key = `${action}:${id}`;
    setPending(key);
    setActionError(null);
    try {
      await apiSend(`${endpoint}/${id}/${action}`, 'POST');
      onDone();
    } catch (error) {
      const row = rows.find((r) => r.id === id);
      let message: string;
      if (
        error instanceof ApiError &&
        error.code === 'CONFLICT' &&
        /already issued/i.test(error.message) &&
        row
      ) {
        message = localizeAlreadyIssued(error, row);
      } else if (error instanceof ApiError) {
        const locale = currentLocale();
        message = localizeErrorMessage(error.code, error.message, locale);
      } else if (error instanceof Error) {
        message = error.message;
      } else {
        message = String(error);
      }
      setActionError(message);
    } finally {
      setPending(null);
    }
  }

  if (result.state === 'loading') {
    return <p className="py-8 text-center text-sm text-ink-muted">{t('loading')}</p>;
  }

  if (result.state === 'failed') {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-ink-muted">{t('loadFailed')}</p>
        <p className="mt-1 text-sm text-ink-muted">{result.error.message}</p>
      </div>
    );
  }

  const rows = result.data.items;
  const hasActiveFilters = q !== '' || status !== '';
  const clearFilters = () => {
    setQ('');
    setStatus('');
  };
  const filters = (
    <FilterBar
      locale={locale}
      q={q}
      onQChange={setQ}
      status={status}
      onStatusChange={setStatus}
      showSearch={true}
      showStatus={true}
      searchPlaceholder="filter"
      onClear={hasActiveFilters ? clearFilters : undefined}
    />
  );

  if (rows.length === 0) {
    return (
      <div>
        {filters}
        <div className="py-8 text-center">
          {hasActiveFilters ? (
            <>
              <p className="text-sm text-ink-muted">{t('noResults')}</p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:bg-surface-sunken"
              >
                {t('clearFilters')}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-muted">{t(emptyKey)}</p>
              {canCreate ? (
                <Link href={newHref} className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:bg-surface-sunken">
                  {t(addFirstKey)}
                </Link>
              ) : null}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {filters}
      {canCreate ? (
        <div className="mb-4 flex justify-end">
          <Link href={newHref} className="inline-flex items-center justify-center gap-2 rounded-lg border border-transparent bg-brand px-3.5 py-2 text-sm font-medium text-brand-contrast hover:bg-brand-hover">
            {t(newKey)}
          </Link>
        </div>
      ) : null}
      {actionError ? (
        <p role="alert" className="mb-4 text-sm text-danger">
          {actionError}
        </p>
      ) : null}
      <div className="divide-y divide-line">
        {rows.map((row) => {
          // View/Print ride on the archived PDF, not on the transition
          // permissions: they render whenever the endpoint serves one, even
          // when the session cannot issue or cancel.
          const pdf = pdfHref(endpoint, row);
          const showRowActions = showActions || pdf !== null;
          const canIssueRow = showIssue && row.status === 'DRAFT';
          const canCancelRow = showCancel && row.status !== 'CANCELLED';
          return (
            <div key={row.id} className="py-4">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                <div>
                  <p className="font-medium text-ink">{row.number ?? t('statusDraft')}</p>
                  <p className="text-sm text-ink-muted">{row.partyName}</p>
                </div>
                <div className="text-sm text-ink-muted">
                  <p className="mb-1">{t('docCounterparty')}</p>
                  <p className="font-medium">{row.partyName}</p>
                </div>
                <div className="text-sm text-ink-muted">
                  <p className="mb-1">{t('docStatus')}</p>
                  <p className="font-medium">{t(statusKey(row.status))}</p>
                </div>
                <div className="text-sm text-ink-muted">
                  <p className="mb-1">{t('docTotal')}</p>
                  <p className="font-medium text-success">
                    {row.grossAmount} {row.currency}
                  </p>
                </div>
              </div>
              {showRowActions ? (
                <div className="mt-2 flex gap-2">
                  {canIssueRow ? (
                    <button
                      type="button"
                      disabled={pending !== null}
                      onClick={() => void runAction(row.id, 'issue')}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-sunken disabled:opacity-50"
                    >
                      {t('docIssue')}
                    </button>
                  ) : null}
                  {canCancelRow ? (
                    <button
                      type="button"
                      disabled={pending !== null}
                      onClick={() => void runAction(row.id, 'cancel')}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-sunken disabled:opacity-50"
                    >
                      {t('cancel')}
                    </button>
                  ) : null}
                  {pdf !== null ? (
                    <a
                      href={pdf}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-sunken"
                    >
                      {t('viewButton')}
                    </a>
                  ) : null}
                  {pdf !== null ? (
                    <a
                      href={pdf}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-sunken"
                    >
                      {t('printButton')}
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}