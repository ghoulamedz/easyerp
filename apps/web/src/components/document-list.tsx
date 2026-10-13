'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { DocumentSummary } from '@easyerp/contracts';
import { translatorFor, type Locale, type MessageKey } from '../i18n/config';
import { ApiError, apiSend } from '../lib/api';
import { useCollection } from '../lib/use-collection';
import { useHasPermission } from '../lib/use-permissions';

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
  onDone,
}: DocumentListProps & { onDone: () => void }) {
  const t = translatorFor(locale);
  const result = useCollection<DocumentSummary>(endpoint);
  const canCreate = useHasPermission(createPermission);
  // Always called (hooks order): an absent prop can never match a permission.
  const canIssue = useHasPermission(issuePermission ?? '');
  const canCancel = useHasPermission(cancelPermission ?? '');
  const showIssue = issuePermission !== undefined && canIssue;
  const showCancel = cancelPermission !== undefined && canCancel;
  const showActions = showIssue || showCancel;
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function runAction(id: string, action: 'issue' | 'cancel'): Promise<void> {
    const key = `${action}:${id}`;
    setPending(key);
    setActionError(null);
    try {
      await apiSend(`${endpoint}/${id}/${action}`, 'POST');
      onDone();
    } catch (error) {
      setActionError(
        error instanceof ApiError || error instanceof Error ? error.message : String(error),
      );
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

  if (rows.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-ink-muted">{t(emptyKey)}</p>
        {canCreate ? (
          <Link href={newHref} className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:bg-surface-sunken">
            {t(addFirstKey)}
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div>
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
            {showActions ? (
              <div className="mt-2 flex gap-2">
                {showIssue ? (
                  <button
                    type="button"
                    disabled={pending !== null}
                    onClick={() => void runAction(row.id, 'issue')}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-sunken disabled:opacity-50"
                  >
                    {t('docIssue')}
                  </button>
                ) : null}
                {showCancel ? (
                  <button
                    type="button"
                    disabled={pending !== null}
                    onClick={() => void runAction(row.id, 'cancel')}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-sunken disabled:opacity-50"
                  >
                    {t('cancel')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
