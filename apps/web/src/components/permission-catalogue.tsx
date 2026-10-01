'use client';

import { useMemo, useState } from 'react';
import { IconSearch } from './icons';
import { Badge, Card, CardBody, EmptyState, cx } from './ui';
import { allPermissions } from '@easyerp/contracts';
import { groupByResource, matchesFilter, parsePermission } from '../lib/permissions';
import { translatorFor, type Locale } from '../i18n/config';

/**
 * The permission catalogue, read from the same shared contract the API enforces.
 *
 * Not a copy: if a permission is added to `@easyerp/contracts` and granted by a
 * role, it appears here in the same release. A second list would drift, and a
 * drifted permission list is exactly the kind of documentation that makes people
 * trust something untrue.
 */
export function PermissionCatalogue({ locale }: { locale: Locale }) {
  const t = translatorFor(locale);
  const [filter, setFilter] = useState('');

  const groups = useMemo(() => {
    const entries = allPermissions.map((permission) => parsePermission(permission));
    return groupByResource(entries.filter((entry) => matchesFilter(entry, filter)));
  }, [filter]);

  const visible = groups.reduce((total, group) => total + group.actions.length, 0);

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative block min-w-64 flex-1">
            <span className="sr-only">{t('permissionsSearch')}</span>
            <IconSearch className="pointer-events-none absolute inset-block-start-1/2 inset-inline-start-3 size-4 -translate-y-1/2 text-ink-subtle" />
            <input
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={t('permissionsSearch')}
              className={cx(
                'w-full rounded-lg border border-line bg-surface py-2 ps-9 pe-3 text-sm text-ink',
                'placeholder:text-ink-subtle focus:border-brand focus:outline-none',
              )}
            />
          </label>
          <Badge tone="brand">{t('permissionsTotal', { count: visible })}</Badge>
        </div>

        {groups.length === 0 ? (
          <EmptyState>{t('permissionsEmpty')}</EmptyState>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((group) => (
              <li key={group.resource} className="rounded-lg border border-line bg-surface p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                  {t('permissionsResource')} · {group.resource}
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {group.actions.map((action) => (
                    <li key={action}>
                      <code
                        className={cx(
                          'rounded-md bg-surface-sunken px-2 py-1 font-mono text-xs text-ink',
                          `${group.resource}:${action}`,
                        )}
                      >
                        {action}
                      </code>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
