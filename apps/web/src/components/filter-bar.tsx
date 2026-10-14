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
}

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

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (q) count += 1;
    if (status) count += 1;
    if (itemType) count += 1;
    if (role) count += 1;
    return count;
  }, [q, status, itemType, role]);

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
      <div className="flex flex-wrap gap-2">
        {showStatus && (
          <Select
            value={status ?? ''}
            onChange={handleStatusChange}
            options={statusOptions}
            className="w-40"
          />
        )}
        {showItemType && (
          <Select
            value={itemType ?? ''}
            onChange={handleItemTypeChange}
            options={itemTypeOptions}
            className="w-40"
          />
        )}
        {showRole && (
          <Select
            value={role ?? ''}
            onChange={handleRoleChange}
            options={roleOptions}
            className="w-40"
          />
        )}
      </div>
      {activeFiltersCount > 0 && (
        <span className="text-xs text-ink-muted whitespace-nowrap">
          {t('filter')} ({activeFiltersCount})
        </span>
      )}
    </div>
  );
}