/**
 * @vitest-environment jsdom
 *
 * Navigation. The rule worth defending: exactly one item is ever active.
 *
 * An "active" style that quietly matches every page is worse than none, because
 * it looks like information.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppNav, navItemsFor } from './app-nav';
import { translatorFor } from '../i18n/config';

const t = translatorFor('en');
const items = navItemsFor(t, 'fr');

function renderNav(currentPath: string, onNavigate?: () => void) {
  return render(
    <AppNav items={items} currentPath={currentPath} label="Main" onNavigate={onNavigate} />,
  );
}

function activeLabels(): string[] {
  return screen
    .getAllByRole('link')
    .filter((link) => link.getAttribute('aria-current') === 'page')
    .map((link) => link.textContent?.trim() ?? '');
}

describe('navItemsFor', () => {
  it('links the dashboard to its own path, so it is not a prefix of every route', () => {
    expect(items.find((item) => item.key === 'dashboard')?.href).toBe('/fr/dashboard');
  });

  it('keeps every link inside the current locale', () => {
    for (const item of items) {
      expect(item.href.startsWith('/fr/')).toBe(true);
    }
  });
});

describe('AppNav', () => {
  it('marks the dashboard active on the dashboard', () => {
    renderNav('/fr/dashboard');
    expect(activeLabels()).toEqual(['Dashboard']);
  });

  it('marks exactly one item active on every route', () => {
    for (const path of ['/fr/dashboard', '/fr/permissions', '/fr/settings']) {
      const view = renderNav(path);
      expect(activeLabels(), path).toHaveLength(1);
      view.unmount();
    }
  });

  it('does not leave the dashboard active on a sibling page', () => {
    renderNav('/fr/settings');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
  });

  it('treats a nested path as part of its parent section', () => {
    renderNav('/fr/settings/business');
    expect(activeLabels()).toEqual(['Settings']);
  });

  it('marks nothing active on a page it does not own, rather than guessing', () => {
    renderNav('/fr/unknown');
    expect(activeLabels()).toEqual([]);
  });

  it('does not mark an item from another locale active', () => {
    // `/en/dashboard` is a different application route, not a child of the
    // French dashboard link.
    renderNav('/en/dashboard');
    expect(activeLabels()).toEqual([]);
  });

  it('closes the mobile drawer when a link is followed', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    renderNav('/fr/dashboard', onNavigate);

    await user.click(screen.getByRole('link', { name: 'Permissions' }));
    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it('is labelled for assistive technology', () => {
    renderNav('/fr/dashboard');
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });
});
