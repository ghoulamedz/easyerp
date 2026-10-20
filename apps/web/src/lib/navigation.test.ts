/**
 * Every screen's back control, checked against the routes the app actually serves.
 *
 * The gate is the filesystem: this walks `app/[locale]` for `page.tsx` files, turns
 * each into the path a browser would request, and requires `parentOf` to answer with a
 * path that is *also* a real page. A route added without a parent therefore fails here
 * instead of shipping a back button that lands on a 404.
 */

import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { LIST_ROUTES, backLabel, parentOf } from './navigation';

const APP = path.resolve(import.meta.dirname, '../app/[locale]');

/** Every page the app serves, as a path under a locale (`/items/[id]/edit`). */
function pageRoutes(): string[] {
  const found: string[] = [];

  const walk = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = path.join(directory, entry.name);
      // Route groups and parallel routes are not path segments.
      const segment = entry.name.startsWith('(') ? '' : `/${entry.name}`;
      if (existsSync(path.join(full, 'page.tsx'))) found.push(prefix + segment);
      walk(full, prefix + segment);
    }
  };

  walk(APP, '');
  return found.sort();
}

/** A concrete path for a route template: `[id]` and friends become a real value. */
function concrete(route: string): string {
  return `/fr${route}`.replace(/\[[^\]]+\]/g, 'abc');
}

/** Whether the app serves this path (allowing for a dynamic segment). */
function isServed(route: string): boolean {
  return pageRoutes().some((candidate) => {
    const parts = candidate.split('/');
    const wanted = route.replace(/^\/fr/, '').split('/');
    if (parts.length !== wanted.length) return false;
    return parts.every((part, index) => part.startsWith('[') || part === wanted[index]);
  });
}

describe('parentOf', () => {
  it('finds every page the app serves', () => {
    // A gate that walks nothing passes silently.
    expect(pageRoutes().length).toBeGreaterThan(40);
  });

  it('answers with a page that exists, for every page that exists', () => {
    const broken: string[] = [];

    for (const route of pageRoutes()) {
      const parent = parentOf(concrete(route));
      if (!isServed(parent)) broken.push(`${route} → ${parent}`);
    }

    expect(broken).toEqual([]);
  });

  it('steps up one level, not to the dashboard, below a list', () => {
    // The distinction segment-counting gets wrong: `/purchasing/receipts` is a list,
    // `/purchasing/orders` is not.
    expect(parentOf('/fr/items/abc/edit')).toBe('/fr/items');
    expect(parentOf('/fr/items/new')).toBe('/fr/items');
    expect(parentOf('/fr/purchasing/receipts/abc')).toBe('/fr/purchasing/receipts');
    expect(parentOf('/fr/purchasing/receipts/new')).toBe('/fr/purchasing/receipts');
    expect(parentOf('/fr/purchasing/orders/abc/edit')).toBe('/fr/purchasing');
    expect(parentOf('/fr/production/orders/abc')).toBe('/fr/production');
    expect(parentOf('/fr/settings/units/abc/edit')).toBe('/fr/settings/units');
    expect(parentOf('/fr/settings/users/new')).toBe('/fr/settings/users');
    expect(parentOf('/fr/settings')).toBe('/fr/dashboard');
  });

  it('treats an invoice detail as a Customer Invoice', () => {
    // The paper lives at `/invoices/<id>`; the list that owns it is elsewhere.
    expect(parentOf('/fr/invoices/abc')).toBe('/fr/customer-invoices');
  });

  it('keeps every locale', () => {
    for (const locale of ['fr', 'en', 'ar']) {
      expect(parentOf(`/${locale}/items/abc/edit`)).toBe(`/${locale}/items`);
    }
  });

  it('falls back to the dashboard rather than inventing a path', () => {
    expect(parentOf('/')).toBe('/fr/dashboard');
    expect(parentOf('/fr')).toBe('/fr/dashboard');
    expect(parentOf('/fr/dashboard')).toBe('/fr/dashboard');
    expect(parentOf('/nonsense')).toBe('/fr/dashboard');
  });

  it('names every list route it can land on', () => {
    // Each entry must be a real page, or the walk stops somewhere that 404s.
    const missing = LIST_ROUTES.filter((route) => !isServed(`/fr${route}`));
    expect(missing).toEqual([]);
  });
});

describe('backLabel', () => {
  it('is translated', () => {
    expect(backLabel('fr')).toBe('Retour');
    expect(backLabel('en')).toBe('Back');
    expect(backLabel('ar')).toBe('رجوع');
  });
});
