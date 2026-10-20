/**
 * @vitest-environment jsdom
 *
 * The back control every screen carries.
 *
 * It lives in `PageHeader`, so the gate is that the header renders one and that it goes
 * where `parentOf` says. The alternative — adding a button to fifty-eight pages — is
 * fifty-eight chances for one of them to be missed, which is what this test exists to
 * make impossible.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PageHeader } from './ui';

const push = vi.fn();
let pathname = '/fr/items/abc/edit';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => pathname,
}));

beforeEach(() => {
  vi.clearAllMocks();
  pathname = '/fr/items/abc/edit';
});

describe('PageHeader', () => {
  it('carries a back control on every screen', async () => {
    render(<PageHeader title="Edit item" />);

    expect(await screen.findByRole('button', { name: 'Retour' })).toBeInTheDocument();
  });

  it('goes to the screen the thing being edited belongs to', async () => {
    const user = userEvent.setup();
    render(<PageHeader title="Edit item" />);

    await user.click(await screen.findByRole('button', { name: 'Retour' }));

    // Not history: the list this Item belongs to, however the visitor arrived.
    expect(push).toHaveBeenCalledWith('/fr/items');
  });

  it('speaks the locale of the page', async () => {
    pathname = '/ar/items/abc/edit';
    render(<PageHeader title="تعديل الصنف" />);

    expect(await screen.findByRole('button', { name: 'رجوع' })).toBeInTheDocument();
  });

  it('can be turned off where back would be a loop', async () => {
    // The dashboard is where back lands, so a control on it points at itself.
    render(<PageHeader title="Dashboard" hideBack />);

    expect(screen.queryByRole('button', { name: /Retour|Back|رجوع/ })).not.toBeInTheDocument();
  });

  it('keeps its title and description', () => {
    render(<PageHeader title="Items" description="What you sell" hideBack />);

    expect(screen.getByRole('heading', { name: 'Items' })).toBeInTheDocument();
    expect(screen.getByText('What you sell')).toBeInTheDocument();
  });
});
