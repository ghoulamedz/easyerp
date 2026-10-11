'use client';

import type { LabelRecord } from '@easyerp/contracts';
import { translatorFor, type Locale, type MessageKey } from '../i18n/config';
import { useCollection } from '../lib/use-collection';
import { useHasPermission } from '../lib/use-permissions';

function labelTypeKey(type: LabelRecord['entityType']): MessageKey {
  return type === 'DOCUMENT' ? 'labelTypeDocument' : 'labelTypeTaxRate';
}

export function LabelsList({ locale }: { locale: Locale }) {
  const t = translatorFor(locale);
  const result = useCollection<LabelRecord>('/settings/labels');
  const canManage = useHasPermission('terminology:manage');

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
        <p className="text-sm text-ink-muted">{t('noLabels')}</p>
        {canManage ? (
          <a href={`/${locale}/settings/labels/new`} className="btn btn-outline mt-4 inline-block">
            {t('addFirstLabel')}
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      {canManage ? (
        <div className="mb-4 flex justify-end">
          <a href={`/${locale}/settings/labels/new`} className="btn btn-primary">
            {t('newLabel')}
          </a>
        </div>
      ) : null}
      <div className="divide-y divide-line">
        {rows.map((label) => (
          <div key={`${label.entityType}-${label.entityCode}-${label.locale}`} className="py-4">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
              <div>
                <p className="font-medium text-ink">{t(labelTypeKey(label.entityType))}</p>
                <p className="text-sm text-ink-muted">{label.entityCode}</p>
              </div>
              <div className="text-sm text-ink-muted">
                <p className="mb-1">{t('labelLocale')}</p>
                <p className="font-medium">{label.locale.toUpperCase()}</p>
              </div>
              <div className="text-sm text-ink-muted">
                <p className="mb-1">{t('labelValue')}</p>
                <p className="font-medium">{label.value}</p>
              </div>
              <div className="text-sm text-ink-muted">
                <p className="mb-1">{t('locale')}</p>
                <p className="font-medium">{label.locale}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}