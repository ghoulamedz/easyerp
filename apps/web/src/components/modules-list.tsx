'use client';

import type { ModuleState } from '@easyerp/contracts';
import { translatorFor, type Locale } from '../i18n/config';
import { useCollection } from '../lib/use-collection';
import { useHasPermission } from '../lib/use-permissions';

export function ModulesList({ locale }: { locale: Locale }) {
  const t = translatorFor(locale);
  const result = useCollection<ModuleState>('/settings/modules');
  const canManage = useHasPermission('business-settings:update');

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
        <p className="text-sm text-ink-muted">{t('noModules')}</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-line">
      {rows.map((module) => (
        <div key={module.module} className="py-4 flex items-center justify-between">
          <div>
            <p className="font-medium text-ink">{module.module}</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={module.isEnabled}
              readOnly
            />
            <div className="w-11 h-6 bg-ink-subtle peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-soft rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand peer-checked:after:border-brand" />
            <span className="ml-3 text-sm text-ink-muted">
              {module.isEnabled ? t('moduleEnabled') : t('moduleDisabled')}
            </span>
          </label>
        </div>
      ))}
    </div>
  );
}