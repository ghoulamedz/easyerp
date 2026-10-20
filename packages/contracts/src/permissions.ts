/**
 * Permissions are the only thing that authorizes an action (CONTEXT.md).
 * A role is a named bundle of these strings; nothing in the interface grants
 * anything, and every string here is checked server-side on every request.
 *
 * The catalog below is the single source of truth: a permission that is not
 * listed cannot be granted to a role, so a typo in a seed or a hidden button is
 * a startup error rather than a privilege nobody holds.
 */

import { z } from 'zod';

export const PERMISSION_PATTERN = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;

export const PERMISSION_CATALOG = {
  salesOrder: [
    'sales-order:read',
    'sales-order:create',
    'sales-order:update',
    'sales-order:delete',
    'sales-order:issue',
    'sales-order:cancel',
  ],
  purchaseOrder: [
    'purchase-order:read',
    'purchase-order:create',
    'purchase-order:update',
    'purchase-order:delete',
    'purchase-order:issue',
    'purchase-order:cancel',
  ],
  deliveryNote: [
    'delivery-note:read',
    'delivery-note:create',
    'delivery-note:update',
    'delivery-note:issue',
  ],
  // No `goods-receipt:update`: a receipt is issued at creation and corrected on the
  // stock ledger, never by editing the document.
  goodsReceipt: ['goods-receipt:read', 'goods-receipt:create'],
  customerInvoice: [
    'customer-invoice:read',
    'customer-invoice:create',
    'customer-invoice:update',
    'customer-invoice:delete',
    'customer-invoice:issue',
  ],
  creditNote: [
    'credit-note:read',
    'credit-note:create',
    'credit-note:update',
    'credit-note:delete',
    'credit-note:issue',
  ],
  payment: ['payment:read', 'payment:create', 'payment:delete'],
  item: ['item:read', 'item:create', 'item:update', 'item:delete'],
  party: ['party:read', 'party:create', 'party:update', 'party:delete'],
  stock: ['stock:read', 'stock:adjust'],
  production: [
    'production-order:read',
    'production-order:create',
    'production-order:update',
    'production-order:issue',
    'production-order:cancel',
  ],
  bom: ['bom:read', 'bom:create'],
  identity: ['user:read', 'user:create', 'user:update', 'user:delete'],
  role: ['role:read', 'role:create', 'role:update', 'role:delete'],
  settings: [
    'business-settings:read',
    'business-settings:update',
    'tax-rate:manage',
    'number-series:manage',
    'custom-field:manage',
    'terminology:manage',
  ],
  audit: ['audit-trail:read'],
} as const;

export type PermissionGroup = keyof typeof PERMISSION_CATALOG;

/** The union of every granted permission. Assigning a string to it is a compile error. */
export type Permission = (typeof PERMISSION_CATALOG)[PermissionGroup][number];

const CATALOG_SET: ReadonlySet<string> = new Set(
  (Object.keys(PERMISSION_CATALOG) as PermissionGroup[]).flatMap((group) => [
    ...PERMISSION_CATALOG[group],
  ]),
);

export const permissionSchema = z
  .string()
  .regex(PERMISSION_PATTERN, 'expected a permission of the form resource:action')
  .refine((value) => CATALOG_SET.has(value), { message: 'unknown permission' })
  .describe('A permission of the form `resource:action`, present in the catalog.');

/** Every permission in the catalog, flattened. */
export const allPermissions: readonly Permission[] = (
  Object.keys(PERMISSION_CATALOG) as PermissionGroup[]
).flatMap((group) => PERMISSION_CATALOG[group]);

export function isPermission(value: string): value is Permission {
  return CATALOG_SET.has(value);
}

/**
 * Whether a granted bundle satisfies a requirement. Exact match on purpose: a
 * wildcard in an authorization system is a privilege escalation waiting for the
 * first mistyped requirement.
 */
export function hasPermission(granted: Iterable<string>, required: Permission): boolean {
  for (const permission of granted) {
    if (permission === required) return true;
  }
  return false;
}

/** Every `read` permission, used to seed a read-only role. */
export function readOnlyPermissions(): readonly Permission[] {
  return allPermissions.filter((permission) => permission.endsWith(':read'));
}
