'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { DocumentSummary, DocumentType } from '@easyerp/contracts';
import { translatorFor, type Locale, type MessageKey } from '../i18n/config';
import { useCollection } from '../lib/use-collection';
import { useHasPermission } from '../lib/use-permissions';
import { FilterBar } from './filter-bar';
import { DocumentActions, printHrefFor } from './document-actions';

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
 * Every document endpoint serves `GET <endpoint>/:id/print` — the paper rendered
 * from the stored row, in the visitor's browser (ADR 0010).
 *
 * A Draft prints too: the figures are already stored on the draft row, and "what
 * will this look like" is a question asked before issuing. The paper carries
 * BROUILLON across the sheet, so a preview can never be mistaken for a filed
 * document. Nothing here is conditional on status any more.
 */


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
   * The detail screen of these rows, when it is not the default: the row's View
   * link points at `<detailBaseHref>/<id>`, the same screen its Print link renders.
   */
  detailBaseHref?: string;
  /**
   * When set, DRAFT rows offer an Edit link to `<editBaseHref>/<id>/edit`.
   * An issued document has no edit link at all: it is immutable, corrected by a
   * Credit Note (ADR 0006), and the API refuses the update anyway — the
   * interface must not offer a button whose only outcome is an error.
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
  detailBaseHref,
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
                <Link
                  href={newHref}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-transparent bg-brand px-3.5 py-2 text-sm font-medium text-brand-contrast hover:bg-brand-hover"
                >
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
    <div className="space-y-4">
      {filters}
      {/* The create button belongs to the list that has rows to add to. An *empty*
          list says it once, in its own words (`addFirstKey`); rendering both here
          and there is how a fresh database showed two buttons that did the same
          thing under two names. */}
      {canCreate ? (
        <div className="flex justify-end">
          <Link
            href={newHref}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-transparent bg-brand px-3.5 py-2 text-sm font-medium text-brand-contrast hover:bg-brand-hover"
          >
            {t(newKey)}
          </Link>
        </div>
      ) : null}
      <div className="divide-y divide-line">
        {rows.map((row) => (
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
            <div className="mt-2">
              <DocumentActions
                locale={locale}
                endpoint={endpoint}
                id={row.id}
                type={row.type}
                status={row.status}
                number={row.number}
                printHref={printHrefFor(endpoint, row.id)}
                issuePermission={issuePermission}
                cancelPermission={cancelPermission}
                editPermission={editPermission}
                editBaseHref={editBaseHref}
                detailHref={detailBaseHref ? detailBaseHref + "/" + row.id : undefined}
                onChanged={onDone}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
