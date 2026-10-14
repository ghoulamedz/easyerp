'use client';

import { useCallback, useMemo } from 'react';
import { translatorFor, type Locale, type MessageKey } from '../i18n/config';
import { Select, type SelectOption } from './ui';

interface FilterBarProps {
  locale: Locale;
  /** Current search query */
  q: string;
  /** Called when search query changes */
  onQChange: (q: string) => void;
  /** Current status filter (for documents) */
  status?: string;
  /** Called when status filter changes */
  onStatusChange?: (status: string) => void;
  /** Current item type filter (for items) */
  itemType?: string;
  /** Called when item type filter changes */
  onItemTypeChange?: (itemType: string) => void;
  /** Current role filter (for parties) */
  role?: string;
  /** Called when role filter changes */
  onRoleChange?: (role: string) => void;
  /** Placeholder for search input */
  searchPlaceholder?: MessageKey;
  /** Whether to show the search input */
  showSearch?: boolean;
  /** Whether to show the status filter */
  showStatus?: boolean;
  /** Whether to show the item type filter */
  showItemType?: boolean;
  /** Whether to show the role filter */
  showRole?: boolean;
  /** Called to reset every filter. The clear button renders only when set and a filter is active. */
  onClear?: (() => void) | undefined;
}

/**
 * One filter row for every list screen. Search and each dropdown feed the
 * collection query (server-side where the endpoint reads them); screens whose
 * endpoint takes no query filter their already-fetched rows client-side from
 * the same `q`. Labels reuse the shared `filterBy*` keys — no screen invents
 * its own wording.
 */
export function FilterBar({
  locale,
  q,
  onQChange,
  status,
  onStatusChange,
  itemType,
  onItemTypeChange,
  role,
  onRoleChange,
  searchPlaceholder = 'filter',
  showSearch = true,
  showStatus = false,
  showItemType = false,
  showRole = false,
  onClear,
}: FilterBarProps) {
  const t = translatorFor(locale);

  const handleQChange = useCallback(
    (value: string) => {
      onQChange(value);
    },
    [onQChange],
  );

  const handleStatusChange = useCallback(
    (value: string) => {
      onStatusChange?.(value);
    },
    [onStatusChange],
  );

  const handleItemTypeChange = useCallback(
    (value: string) => {
      onItemTypeChange?.(value);
    },
    [onItemTypeChange],
  );

  const handleRoleChange = useCallback(
    (value: string) => {
      onRoleChange?.(value);
    },
    [onRoleChange],
  );

  const statusOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: t('statusAll') },
      { value: 'DRAFT', label: t('statusDraft') },
      { value: 'ISSUED', label: t('statusIssued') },
      { value: 'CANCELLED', label: t('statusCancelled') },
    ],
    [t],
  );

  const itemTypeOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: t('itemTypeAll') },
      { value: 'RAW_MATERIAL', label: t('itemTypeRawMaterial') },
      { value: 'SEMI_FINISHED', label: t('itemTypeSemiFinished') },
      { value: 'FINISHED_GOOD', label: t('itemTypeFinishedGood') },
      { value: 'SERVICE', label: t('itemTypeService') },
      { value: 'CONSUMABLE', label: t('itemTypeConsumable') },
    ],
    [t],
  );

  const roleOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: t('roleAll') },
      { value: 'CUSTOMER', label: t('roleCustomer') },
      { value: 'SUPPLIER', label: t('roleSupplier') },
    ],
    [t],
  );

  const hasActiveFilters = Boolean(q || status || itemType || role);

  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      {showSearch && (
        <div className="flex-1 sm:max-w-xs">
          <label htmlFor="filter-search" className="sr-only">
            {t(searchPlaceholder)}
          </label>
          <input
            id="filter-search"
            type="search"
            value={q}
            onChange={(e) => handleQChange(e.target.value)}
            placeholder={t(searchPlaceholder)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none"
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {showStatus && (
          <label className="inline-flex items-center">
            <span className="sr-only">{t('filterByStatus')}</span>
            <Select
              value={status ?? ''}
              onChange={handleStatusChange}
              options={statusOptions}
              className="w-40"
            />
          </label>
        )}
        {showItemType && (
          <label className="inline-flex items-center">
            <span className="sr-only">{t('filterByType')}</span>
            <Select
              value={itemType ?? ''}
              onChange={handleItemTypeChange}
              options={itemTypeOptions}
              className="w-40"
            />
          </label>
        )}
        {showRole && (
          <label className="inline-flex items-center">
            <span className="sr-only">{t('filterByRole')}</span>
            <Select
              value={role ?? ''}
              onChange={handleRoleChange}
              options={roleOptions}
              className="w-40"
            />
          </label>
        )}
        {onClear && hasActiveFilters ? (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-surface-sunken"
          >
            {t('clearFilters')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
