import { describe, expect, it } from 'vitest';
import { allPermissions } from '@easyerp/contracts';
import {
  groupByResource,
  matchesFilter,
  parsePermission,
  PERMISSION_RESOURCES,
} from './permissions';

describe('parsePermission', () => {
  it('splits resource from action', () => {
    expect(parsePermission('sales-order:create')).toEqual({
      permission: 'sales-order:create',
      resource: 'sales-order',
      action: 'create',
    });
  });

  it('keeps a hyphenated resource intact', () => {
    expect(parsePermission('audit-trail:read').resource).toBe('audit-trail');
  });

  it('does not throw on a malformed permission', () => {
    // A bad string in the catalogue should render, not crash the settings page.
    expect(parsePermission('nocolon')).toEqual({
      permission: 'nocolon',
      resource: 'nocolon',
      action: '',
    });
  });
});

describe('groupByResource', () => {
  it('sorts actions inside each resource', () => {
    const grouped = groupByResource([
      parsePermission('sales-order:issue'),
      parsePermission('sales-order:create'),
      parsePermission('sales-order:read'),
    ]);
    expect(grouped).toEqual([{ resource: 'sales-order', actions: ['create', 'issue', 'read'] }]);
  });

  it('merges nothing across resources', () => {
    const grouped = groupByResource([parsePermission('item:read'), parsePermission('role:read')]);
    expect(grouped).toHaveLength(2);
  });

  it('handles an empty catalogue', () => {
    expect(groupByResource([])).toEqual([]);
  });
});

describe('matchesFilter', () => {
  const entry = parsePermission('sales-order:create');

  it('matches everything when the filter is empty', () => {
    expect(matchesFilter(entry, '')).toBe(true);
    expect(matchesFilter(entry, '   ')).toBe(true);
  });

  it('matches on the full permission and on the resource alone', () => {
    expect(matchesFilter(entry, 'sales-order:create')).toBe(true);
    expect(matchesFilter(entry, 'sales-order')).toBe(true);
    expect(matchesFilter(entry, 'ORDER')).toBe(true);
  });

  it('matches on the action too, which is what makes it useful', () => {
    // Someone who remembers `issue` should find it without knowing it lives
    // under sales-order and purchase-order.
    expect(matchesFilter(entry, 'create')).toBe(true);
  });

  it('rejects unrelated text', () => {
    expect(matchesFilter(entry, 'invoice')).toBe(false);
  });
});

describe('the real contract', () => {
  it('holds permissions in the declared resource vocabulary', () => {
    // If this fails, a permission was added to the contract without telling the
    // interface, and the two halves have drifted apart.
    for (const permission of allPermissions) {
      const { resource } = parsePermission(permission);
      expect(PERMISSION_RESOURCES, `${permission} has an unknown resource "${resource}"`).toContain(
        resource,
      );
    }
  });

  it('has no duplicates', () => {
    expect(new Set(allPermissions).size).toBe(allPermissions.length);
  });

  it('grants at least one action on every resource', () => {
    const grouped = groupByResource(allPermissions.map(parsePermission));
    for (const resource of PERMISSION_RESOURCES) {
      const entry = grouped.find((group) => group.resource === resource);
      expect(entry, `resource "${resource}" grants nothing`).toBeDefined();
      expect(entry?.actions.length ?? 0).toBeGreaterThan(0);
    }
  });
});
