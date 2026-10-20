/**
 * @vitest-environment jsdom
 *
 * Which nav entry a Module switch hides.
 *
 * The mapping is not a preference: the API refuses the route, so the link has to
 * go. It was hand-written once and got two entries backwards — the invoice screens
 * were mapped to `SALES` while `customer-invoice.controller.ts` carries
 * `@RequiresModule('FINANCE')`, and the catalog was mapped to `INVENTORY` while the
 * Item and Party controllers deliberately carry no module at all.
 *
 * So the assertions below are read from the API's own sources: the controller
 * decorators for the routes that have them, and `MODULE_BY_DOCUMENT_TYPE` for the
 * document lists. A controller that changes its module, or a contract that moves a
 * Document type, fails this file instead of silently mis-hiding a link.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { MODULE_BY_DOCUMENT_TYPE, MODULES, type ModuleState } from '@easyerp/contracts';
import { isNavVisible, moduleForNavKey } from './use-modules';

const API_SRC = path.resolve(import.meta.dirname, '../../../api/src');

/** The Module named by a controller's `@RequiresModule`, or `null` for none. */
function moduleOf(controllerPath: string): string | null {
  const source = readFileSync(path.join(API_SRC, controllerPath), 'utf8');
  return /@RequiresModule\('([A-Z_]+)'\)/.exec(source)?.[1] ?? null;
}

/** A module list with everything on except the named codes. */
function withDisabled(...disabled: string[]): ModuleState[] {
  return MODULES.map((module) => ({
    module,
    isEnabled: !disabled.includes(module),
  })) as ModuleState[];
}

describe('moduleForNavKey', () => {
  it('reads the document lists from MODULE_BY_DOCUMENT_TYPE', () => {
    // The contract is the API's mapping; the nav must not keep a second copy.
    expect(moduleForNavKey('sales-orders')).toBe(MODULE_BY_DOCUMENT_TYPE.SALES_ORDER);
    expect(moduleForNavKey('delivery-notes')).toBe(MODULE_BY_DOCUMENT_TYPE.DELIVERY_NOTE);
    expect(moduleForNavKey('customer-invoices')).toBe(MODULE_BY_DOCUMENT_TYPE.CUSTOMER_INVOICE);
    expect(moduleForNavKey('credit-notes')).toBe(MODULE_BY_DOCUMENT_TYPE.CREDIT_NOTE);
    expect(moduleForNavKey('purchasing')).toBe(MODULE_BY_DOCUMENT_TYPE.PURCHASE_ORDER);
    expect(moduleForNavKey('production')).toBe(MODULE_BY_DOCUMENT_TYPE.PRODUCTION_ORDER);
  });

  it('agrees with the controllers that guard the same screens', () => {
    // The invoice screens were mapped to SALES once. The controller says FINANCE.
    expect(moduleOf('sales/customer-invoice.controller.ts')).toBe(
      moduleForNavKey('customer-invoices'),
    );
    expect(moduleOf('sales/credit-note.controller.ts')).toBe(moduleForNavKey('credit-notes'));
    expect(moduleOf('sales/sales.controller.ts')).toBe(moduleForNavKey('sales-orders'));
    expect(moduleOf('purchasing/purchase-order.controller.ts')).toBe(moduleForNavKey('purchasing'));
    expect(moduleOf('purchasing/goods-receipt.controller.ts')).toBe(MODULE_BY_DOCUMENT_TYPE.GOODS_RECEIPT);
    expect(moduleOf('production/production-order.controller.ts')).toBe(
      moduleForNavKey('production'),
    );
    expect(moduleOf('production/bom.controller.ts')).toBe(moduleForNavKey('boms'));
    expect(moduleOf('inventory/stock.controller.ts')).toBe(moduleForNavKey('stock'));
    expect(moduleOf('payments/payments.controller.ts')).toBe(moduleForNavKey('payments'));
  });

  it('leaves the catalog and the counterparties ungated, as their controllers are', () => {
    // Items and Parties are the substrate every capability prices from; gating them
    // behind one Module would strand a purchasing-only Business.
    expect(moduleOf('catalog/item.controller.ts')).toBeNull();
    expect(moduleOf('parties/party.controller.ts')).toBeNull();
    expect(moduleForNavKey('items')).toBeNull();
    expect(moduleForNavKey('parties')).toBeNull();
    expect(moduleForNavKey('dashboard')).toBeNull();
    expect(moduleForNavKey('settings')).toBeNull();
    expect(moduleForNavKey('permissions')).toBeNull();
  });
});

describe('isNavVisible', () => {
  it('hides a document list whose own Module is off', () => {
    const states = withDisabled('FINANCE');

    expect(isNavVisible('customer-invoices', states)).toBe(false);
    expect(isNavVisible('credit-notes', states)).toBe(false);
    expect(isNavVisible('payments', states)).toBe(false);
    // The same list under SALES is unaffected: this is the bug the old table had.
    expect(isNavVisible('sales-orders', states)).toBe(true);
  });

  it('keeps the catalog visible when INVENTORY is off', () => {
    const states = withDisabled('INVENTORY');

    expect(isNavVisible('stock', states)).toBe(false);
    expect(isNavVisible('items', states)).toBe(true);
    expect(isNavVisible('parties', states)).toBe(true);
  });

  it('shows everything while the states are still loading or failed to load', () => {
    // A network blip must not empty the navigation.
    expect(isNavVisible('production', null)).toBe(true);
    expect(isNavVisible('items', null)).toBe(true);
  });

  it('shows every Module when all of them are on', () => {
    const states = withDisabled();

    for (const key of [
      'sales-orders',
      'delivery-notes',
      'customer-invoices',
      'credit-notes',
      'purchasing',
      'production',
      'boms',
      'stock',
      'payments',
      'items',
      'parties',
    ]) {
      expect(isNavVisible(key, states), `${key} should be visible`).toBe(true);
    }
  });
});
