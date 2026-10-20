'use client';

/**
 * Module enablement for navigation filtering.
 *
 * `GET /settings/modules` answers the full list; a route the Business switched
 * off 403s on the API (`@RequiresModule` on the controller), so the rail hides it
 * instead of linking to a screen that can only fail. While loading (or on failure)
 * everything stays visible — hiding on a failed fetch would strand the user for a
 * network blip.
 *
 * ## The mapping is derived, not hand-written
 *
 * The first version of this file listed the modules by hand and got two of them
 * wrong: it mapped the invoice screens to `SALES` and the catalog to `INVENTORY`.
 * The API says otherwise — `customer-invoice.controller.ts` and
 * `credit-note.controller.ts` carry `@RequiresModule('FINANCE')`, and the Item and
 * Party controllers deliberately carry *no* module at all, because every capability
 * prices from the same Items and a purchasing-only Business must still record what
 * it buys. So a Business that switched FINANCE off kept its invoice links, and one
 * that switched INVENTORY off lost its catalog while the catalog kept answering.
 *
 * The document entries are therefore read from `MODULE_BY_DOCUMENT_TYPE`, the one
 * place the API's own mapping lives, and the test pins the rest to the decorators.
 */

import { useEffect, useState } from 'react';
import { MODULE_BY_DOCUMENT_TYPE, type ModuleState } from '@easyerp/contracts';
import { apiGet } from './api';

/** Fired after a Module is switched, so every nav re-reads without a reload. */
export const MODULES_CHANGED_EVENT = 'easyerp:modules-changed';

export function useModuleStates(): readonly ModuleState[] | null {
  const [states, setStates] = useState<readonly ModuleState[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = (): void => {
      apiGet<ModuleState[]>('/settings/modules').then(
        (data) => {
          if (!cancelled && Array.isArray(data)) setStates(data);
        },
        () => {
          if (!cancelled) setStates(null);
        },
      );
    };

    load();
    // The settings screen switches a Module in another component tree; without this
    // the rail kept the old list until a full page load, which is what "I turned it
    // off and the link is still there" looked like.
    window.addEventListener(MODULES_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(MODULES_CHANGED_EVENT, load);
    };
  }, []);

  return states;
}

/**
 * The Module a document-list route belongs to, by the Document type it lists.
 *
 * `boms` is the exception the contract cannot express: a BOM is not a Document, so
 * it names `PRODUCTION` the way `bom.controller.ts` does.
 */
const NAV_DOCUMENT_TYPE = {
  'sales-orders': 'SALES_ORDER',
  'delivery-notes': 'DELIVERY_NOTE',
  'customer-invoices': 'CUSTOMER_INVOICE',
  'credit-notes': 'CREDIT_NOTE',
  purchasing: 'PURCHASE_ORDER',
  production: 'PRODUCTION_ORDER',
} as const;

/** Routes gated by a Module that owns no Document type. */
const NAV_MODULE: Readonly<Record<string, string>> = {
  stock: 'INVENTORY',
  payments: 'FINANCE',
  boms: 'PRODUCTION',
};

/** The Module a nav key needs, or `null` when the route answers whenever a session does. */
export function moduleForNavKey(key: string): string | null {
  const documentType = NAV_DOCUMENT_TYPE[key as keyof typeof NAV_DOCUMENT_TYPE];
  if (documentType !== undefined) return MODULE_BY_DOCUMENT_TYPE[documentType];
  return NAV_MODULE[key] ?? null;
}

export function isNavVisible(key: string, states: readonly ModuleState[] | null): boolean {
  if (!states) return true;
  const required = moduleForNavKey(key);
  if (required === null) return true;
  const row = states.find((state) => state.module === required);
  return row?.isEnabled ?? true;
}
