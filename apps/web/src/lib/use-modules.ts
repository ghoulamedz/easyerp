'use client';

/**
 * Module enablement for navigation filtering.
 *
 * `GET /settings/modules` answers the full list; a route the Business switched
 * off 403s on the API (ModulesGuard), so the rail hides it instead of linking
 * to a screen that can only fail. While loading (or on failure) everything
 * stays visible — hiding on a failed fetch would strand the user for a network
 * blip.
 */

import { useEffect, useState } from 'react';
import type { ModuleState } from '@easyerp/contracts';
import { apiGet } from './api';

export function useModuleStates(): readonly ModuleState[] | null {
  const [states, setStates] = useState<readonly ModuleState[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<ModuleState[]>('/settings/modules').then(
      (data) => {
        if (!cancelled && Array.isArray(data)) setStates(data);
      },
      () => {
        if (!cancelled) setStates(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return states;
}

/** Whether the nav entry should render given the fetched states. */
const MODULE_BY_NAV_KEY: Readonly<Record<string, string>> = {
  'sales-orders': 'SALES',
  'delivery-notes': 'SALES',
  'customer-invoices': 'SALES',
  'credit-notes': 'SALES',
  items: 'INVENTORY',
  parties: 'INVENTORY',
  stock: 'INVENTORY',
  purchasing: 'PURCHASING',
  production: 'PRODUCTION',
  boms: 'PRODUCTION',
  payments: 'FINANCE',
};

export function isNavVisible(
  key: string,
  states: readonly ModuleState[] | null,
): boolean {
  if (!states) return true;
  const module = MODULE_BY_NAV_KEY[key];
  if (!module) return true;
  const row = states.find((s) => s.module === module);
  return row?.isEnabled ?? true;
}
