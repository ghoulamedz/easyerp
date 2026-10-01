/**
 * The permission catalogue, straight from the shared contract.
 *
 * The resource list is *derived* from the contract rather than restated here.
 * A second hand-written list would drift, and a drifted permission list is a
 * document that makes people trust something untrue.
 */

import { allPermissions, PERMISSION_CATALOG, type Permission } from '@easyerp/contracts';

export interface PermissionEntry {
  readonly permission: string;
  readonly resource: string;
  readonly action: string;
}

/** Every resource the contract knows about, sorted. */
export const PERMISSION_RESOURCES: readonly string[] = [
  ...new Set(allPermissions.map((permission) => permission.split(':')[0] as string)),
].sort();

/** The contract's own groups, in the order it declares them. */
export const PERMISSION_GROUPS = Object.entries(PERMISSION_CATALOG).map(([group, permissions]) => ({
  group,
  permissions: [...permissions],
}));

export function isPermissionResource(value: string): boolean {
  return PERMISSION_RESOURCES.includes(value);
}

/** Split `sales-order:create` into its resource and action. */
export function parsePermission(permission: Permission | string): PermissionEntry {
  const separator = permission.indexOf(':');
  if (separator < 0) return { permission, resource: permission, action: '' };
  return {
    permission,
    resource: permission.slice(0, separator),
    action: permission.slice(separator + 1),
  };
}

export function groupByResource(entries: readonly PermissionEntry[]): {
  resource: string;
  actions: string[];
}[] {
  const grouped = new Map<string, string[]>();
  for (const entry of entries) {
    const actions = grouped.get(entry.resource) ?? [];
    actions.push(entry.action);
    grouped.set(entry.resource, actions);
  }
  return [...grouped].map(([resource, actions]) => ({ resource, actions: actions.sort() }));
}

export function matchesFilter(entry: PermissionEntry, filter: string): boolean {
  const needle = filter.trim().toLowerCase();
  if (needle === '') return true;
  return (
    entry.permission.toLowerCase().includes(needle) || entry.resource.toLowerCase().includes(needle)
  );
}
