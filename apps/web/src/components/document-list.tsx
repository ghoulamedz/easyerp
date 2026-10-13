'use client';

import Link from 'next/link';
import type { DocumentSummary } from '@easyerp/contracts';
import { translatorFor, type Locale, type MessageKey } from '../i18n/config';
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

export function DocumentList({
  locale,
  endpoint,
  createPermission,
  newHref,
  newKey,
  addFirstKey,
  emptyKey,
}: {
  locale: Locale;
  endpoint: string;
  createPermission: string;
  newHref: string;
  newKey: MessageKey;
  addFirstKey: MessageKey;
  emptyKey: MessageKey;
}) {
  const t = translatorFor(locale);
  const result = useCollection<DocumentSummary>(endpoint);
  const canCreate = useHasPermission(createPermission);

  if (result.state === 'loading') {
    return <p className="py-8 text-center text-sm text-ink-muted">{t('loading')}</p>;
  }

  if (result.state === 'failed') {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-ink-muted">{t('loadFailed')}</p>
        <p className="mt-1 text-sm text-ink-muted">{t('tryAgainOrContactSupport')}</p>
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
          </div>
        ))}
      </div>
    </div>
  );
}
