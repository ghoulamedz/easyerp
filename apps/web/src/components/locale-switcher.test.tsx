/**
 * @vitest-environment jsdom
 *
 * Locale switching. The rule worth defending is that switching language keeps
 * you on the same page — losing your place because you changed language is the
 * kind of small betrayal an interface remembers.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocaleSwitcher } from './locale-switcher';

const push = vi.fn();
let pathname = '/fr/dashboard';

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}));

function renderSwitch(locale: 'fr' | 'en' | 'ar', label = 'Language') {
  return render(<LocaleSwitcher locale={locale} label={label} />);
}

describe('LocaleSwitcher', () => {
  it('offers all three shipped locales', () => {
    renderSwitch('fr');
    expect(screen.getByRole('link', { name: 'FR' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'EN' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'AR' })).toBeInTheDocument();
  });

  it('marks the current locale', () => {
    renderSwitch('ar');
    expect(screen.getByRole('link', { name: 'AR' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('link', { name: 'FR' })).not.toHaveAttribute('aria-current');
  });

  it('keeps you on the same page when you change language', async () => {
    pathname = '/fr/permissions';
    const user = userEvent.setup();
    renderSwitch('fr');

    await user.click(screen.getByRole('link', { name: 'AR' }));

    expect(push).toHaveBeenCalledWith('/ar/permissions');
  });

  it('handles the dashboard, whose path has no trailing segment', async () => {
    pathname = '/en/dashboard';
    const user = userEvent.setup();
    renderSwitch('en');

    await user.click(screen.getByRole('link', { name: 'FR' }));
    expect(push).toHaveBeenCalledWith('/fr/dashboard');
  });

  it('carries `hreflang` so a crawler and a translator both know the language', () => {
    renderSwitch('fr');
    expect(screen.getByRole('link', { name: 'AR' })).toHaveAttribute('hreflang', 'ar');
    expect(screen.getByRole('link', { name: 'AR' })).toHaveAttribute('href', '/ar');
  });

  it('marks each link with its own language, so screen readers switch voice', () => {
    renderSwitch('fr');
    expect(screen.getByRole('link', { name: 'AR' })).toHaveAttribute('lang', 'ar');
  });

  it('is labelled in the current language, not in English', () => {
    renderSwitch('ar', 'اللغة');
    expect(screen.getByText('اللغة')).toHaveClass('sr-only');
  });

  it('does not hijack a new tab', async () => {
    pathname = '/fr';
    const user = userEvent.setup();
    renderSwitch('fr');

    await user.keyboard('{Meta>}');
    await user.click(screen.getByRole('link', { name: 'EN' }));
    // A modified click belongs to the browser, not to the router.
    expect(push).not.toHaveBeenCalled();
  });
});
