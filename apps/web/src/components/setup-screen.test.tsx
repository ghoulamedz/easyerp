/**
 * @vitest-environment jsdom
 *
 * The defaults a fresh `/setup` starts from.
 *
 * These assertions run with `NODE_ENV=test`, which is *not* `development` — the
 * same condition a production or demo deployment is in. That is the point: the
 * country, currency, units and Tax Rates must be prefilled everywhere, while a
 * company's own identity must not be, because a demo that prefills a token or a
 * password ships them in the bundle.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '../lib/theme-provider';
import { SetupScreen } from './setup-screen';

// The screen renders the locale switcher, which asks the router which locale it is in.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/en/setup',
}));

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ needsSetup: true }),
  })) as unknown as typeof fetch;
});

/** The screen renders the theme and locale switches, which need their providers. */
function renderScreen() {
  return render(
    <ThemeProvider>
      <SetupScreen locale="en" />
    </ThemeProvider>,
  );
}

describe('SetupScreen defaults', () => {
  it('starts from the Tunisian facts, not from an empty form', async () => {
    renderScreen();

    expect(await screen.findByLabelText('Country (ISO, 2 letters)')).toHaveValue('TN');
    expect(screen.getByLabelText('Currency (ISO, 3 letters)')).toHaveValue('TND');
  });

  it('offers a weighed unit and a counted one, and the three VAT rates', async () => {
    renderScreen();

    await screen.findByLabelText('Country (ISO, 2 letters)');

    // A kilogram accepts fractions and a piece does not: the flag is what stops an
    // invoice quoting half a piece, so the default has to get both right.
    expect(screen.getByDisplayValue('KG')).toBeInTheDocument();
    expect(screen.getByDisplayValue('PIECE')).toBeInTheDocument();
    const fractionBoxes = screen.getAllByRole('checkbox');
    expect(fractionBoxes.some((box) => (box as HTMLInputElement).checked)).toBe(true);
    expect(fractionBoxes.some((box) => !(box as HTMLInputElement).checked)).toBe(true);

    expect(screen.getByDisplayValue('TVA19')).toBeInTheDocument();
    expect(screen.getByDisplayValue('TVA13')).toBeInTheDocument();
    expect(screen.getByDisplayValue('TVA07')).toBeInTheDocument();
  });

  it('does not prefill a token, a company name or a password outside development', async () => {
    renderScreen();

    const token = await screen.findByLabelText('License key');

    expect(token).toHaveValue('');
    expect(screen.getByLabelText('Registered name')).toHaveValue('');
    expect(screen.getByLabelText('Password (8 characters minimum)')).toHaveValue('');
  });
});
