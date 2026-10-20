/**
 * @vitest-environment jsdom
 *
 * The Settings hub's links.
 *
 * Seven settings screens have their own routes and, until this list existed, nothing
 * linked to them: the rail pointed at `/settings` alone and that page showed
 * Appearance, Language and Business. "There is no Modules selection in the settings
 * screen" was exactly that — a screen that existed and could not be reached.
 *
 * The permission on each entry is checked against the controller that serves it, so a
 * guess cannot survive: the first draft of this list said `business-settings:read` for
 * every entry, and Tax Rates, Number Patterns and Terminology each answer on a
 * different one.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SETTINGS_ENTRIES, SettingsNav } from './settings-nav';

const CONTROLLER = path.resolve(
  import.meta.dirname,
  '../../../api/src/settings/settings.controller.ts',
);

/**
 * The permission each `settings/...` controller requires for its `GET` route, read
 * from the source: controller path → permission.
 */
function requiredPermissions(): Map<string, string> {
  const source = readFileSync(CONTROLLER, 'utf8');
  const found = new Map<string, string>();
  const controllers = [...source.matchAll(/@Controller\('([^']+)'\)/g)];

  for (const [index, controller] of controllers.entries()) {
    const start = controller.index ?? 0;
    const end = controllers[index + 1]?.index ?? source.length;
    const body = source.slice(start, end);
    // The first permission decorator in a controller governs its list route, which is
    // the one a nav link lands on.
    const permission = /@RequirePermissions\('([^']+)'\)/.exec(body)?.[1];
    if (permission !== undefined) found.set(controller[1] ?? '', permission);
  }
  return found;
}

function stubSession(permissions: string[]): void {
  global.fetch = vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url === '/api/auth/get-session') {
      return { ok: true, status: 200, json: async () => ({ session: { userId: 'u-1' } }) };
    }
    if (url === '/api/users/me') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'u-1',
          email: 'owner@example.test',
          displayName: 'Owner',
          isActive: true,
          roleIds: ['r-admin'],
          permissions,
        }),
      };
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as unknown as typeof fetch;
}

describe('SETTINGS_ENTRIES', () => {
  it('links every settings route the app serves', () => {
    // The routes exist as directories; each one needs an entry, or it is reachable
    // only by typing its URL.
    const routes = SETTINGS_ENTRIES.map((entry) => entry.href);
    expect(routes).toContain('/settings/modules');
    expect(routes).toContain('/settings/units');
    expect(routes).toContain('/settings/tax-rates');
    expect(routes).toContain('/settings/number-patterns');
    expect(routes).toContain('/settings/labels');
    expect(routes).toContain('/settings/users');
    expect(routes).toContain('/settings/roles');
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('carries the permission its controller actually requires', () => {
    const required = requiredPermissions();

    for (const entry of SETTINGS_ENTRIES) {
      if (entry.permission === undefined) continue;
      if (entry.href.startsWith('/settings/users') || entry.href.startsWith('/settings/roles')) {
        continue; // served by their own controllers, checked below
      }
      // The controller map is keyed by the route without its leading slash.
      const route = entry.href.replace(/^\//, '');
      expect(required.get(route), `${entry.href} has no controller`).toBeDefined();
      expect(
        entry.permission,
        `${entry.href} links under ${entry.permission} but the API requires ${required.get(route)}`,
      ).toBe(required.get(route));
    }
  });

  it('gates Users and Roles on the permissions their controllers use', () => {
    const users = SETTINGS_ENTRIES.find((entry) => entry.href === '/settings/users');
    const roles = SETTINGS_ENTRIES.find((entry) => entry.href === '/settings/roles');

    expect(users?.permission).toBe('user:read');
    expect(roles?.permission).toBe('role:read');
  });
});

describe('SettingsNav', () => {
  it('offers the Modules screen to a session that may read settings', async () => {
    stubSession(['business-settings:read', 'user:read', 'role:read']);
    render(<SettingsNav locale="en" />);

    const modules = await screen.findByRole('link', { name: /Modules/ });

    expect(modules).toHaveAttribute('href', '/en/settings/modules');
  });

  it('hides a screen whose permission the session lacks', async () => {
    // A link to a route that answers 403 is a button whose only outcome is an error.
    stubSession(['business-settings:read']);
    render(<SettingsNav locale="en" />);

    expect(await screen.findByRole('link', { name: /Modules/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Tax rates/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Users/ })).not.toBeInTheDocument();
  });

  it('shows the Tax Rates screen to the session that may manage them', async () => {
    stubSession(['tax-rate:manage']);
    render(<SettingsNav locale="en" />);

    expect(await screen.findByRole('link', { name: /Tax rates/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Modules/ })).not.toBeInTheDocument();
  });
});
