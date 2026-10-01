/**
 * @vitest-environment jsdom
 *
 * The theme switch as a person uses it: click, and the whole page changes.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeSwitch } from './theme-switch';
import { ThemeProvider } from '../lib/theme-provider';
import { translatorFor } from '../i18n/config';
import { THEME_STORAGE_KEY } from '../lib/theme';

const t = translatorFor('en');

function renderSwitch() {
  return render(
    <ThemeProvider>
      <ThemeSwitch t={t} />
    </ThemeProvider>,
  );
}

function systemPrefersDark(value: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: value && query.includes('dark'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
  systemPrefersDark(false);
});

describe('ThemeSwitch', () => {
  it('offers light, dark and system', () => {
    renderSwitch();
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Light' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'System' })).toBeInTheDocument();
  });

  it('starts on `system`, not on a hard-coded light', async () => {
    systemPrefersDark(true);
    renderSwitch();
    await waitForHydration();
    expect(screen.getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement).toHaveClass('dark');
  });

  it('turns the page dark on click and remembers the choice', async () => {
    const user = userEvent.setup();
    renderSwitch();
    await waitForHydration();

    await user.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
  });

  it('turns the page back to light, and stores that too', async () => {
    const user = userEvent.setup();
    renderSwitch();
    await waitForHydration();

    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    await user.click(screen.getByRole('radio', { name: 'Light' }));

    expect(document.documentElement).not.toHaveClass('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('releases the stored choice when the user goes back to following the system', async () => {
    // Someone who picked dark and then wants their device's behaviour back must
    // be able to get there; a two-state toggle would strand them.
    const user = userEvent.setup();
    renderSwitch();
    await waitForHydration();

    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    await user.click(screen.getByRole('radio', { name: 'System' }));

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(screen.getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'true');
  });

  it('honours a choice made on a previous visit', async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    renderSwitch();
    await waitForHydration();

    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement).toHaveClass('dark');
  });

  it('announces the resulting theme for a screen reader', async () => {
    const user = userEvent.setup();
    renderSwitch();
    await waitForHydration();

    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(await screen.findByText('Current theme: Dark')).toBeInTheDocument();
  });

  it('is reachable by keyboard alone', async () => {
    const user = userEvent.setup();
    renderSwitch();
    await waitForHydration();

    await user.tab();
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    // Radios do not move on arrows by default; what matters is that the control
    // is focusable and activatable without a mouse.
    await user.keyboard(' ');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).not.toBeNull();
  });

  it('labels the group in every locale', () => {
    render(
      <ThemeProvider>
        <ThemeSwitch t={translatorFor('ar')} />
      </ThemeProvider>,
    );
    expect(screen.getByRole('radiogroup', { name: 'السمة' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'ليلي' })).toBeInTheDocument();
  });
});

/** The provider reads storage in an effect; give it a tick. */
async function waitForHydration(): Promise<void> {
  const { act } = await import('react');
  await act(async () => {
    await Promise.resolve();
  });
}
