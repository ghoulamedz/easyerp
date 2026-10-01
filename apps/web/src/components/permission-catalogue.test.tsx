/**
 * @vitest-environment jsdom
 *
 * The permission catalogue. It renders the real shared contract, so these tests
 * also fail if the API and the interface ever disagree about what a permission
 * is.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { allPermissions } from '@easyerp/contracts';
import { PermissionCatalogue } from './permission-catalogue';

describe('PermissionCatalogue', () => {
  it('shows the total from the shared contract, not a hand-kept number', () => {
    render(<PermissionCatalogue locale="en" />);
    expect(screen.getByText(`${allPermissions.length} permissions`)).toBeInTheDocument();
  });

  it('groups permissions by resource', () => {
    render(<PermissionCatalogue locale="en" />);
    expect(screen.getByText(/sales-order/)).toBeInTheDocument();
    expect(screen.getByText(/invoice/)).toBeInTheDocument();
  });

  it('filters as the user types', async () => {
    const user = userEvent.setup();
    render(<PermissionCatalogue locale="en" />);

    await user.type(screen.getByPlaceholderText('Filter permissions…'), 'sales-order');

    expect(screen.getByText(/sales-order/)).toBeInTheDocument();
    expect(screen.queryByText(/purchase-order/)).not.toBeInTheDocument();
  });

  it('matches on the action as well as the resource', async () => {
    const user = userEvent.setup();
    render(<PermissionCatalogue locale="en" />);

    await user.type(screen.getByPlaceholderText('Filter permissions…'), 'issue');

    // `issue` belongs to sales-order and purchase-order, and to neither invoice
    // nor role, so the filter must find both documents resources.
    expect(screen.getByText(/sales-order/)).toBeInTheDocument();
    expect(screen.getByText(/purchase-order/)).toBeInTheDocument();
    expect(screen.queryByText(/audit-trail/)).not.toBeInTheDocument();
  });

  it('says so when nothing matches, instead of showing an empty grid', async () => {
    const user = userEvent.setup();
    render(<PermissionCatalogue locale="en" />);

    await user.type(screen.getByPlaceholderText('Filter permissions…'), 'zzz-nothing');

    expect(screen.getByText('No permission matches.')).toBeInTheDocument();
  });

  it('ignores surrounding whitespace in the filter', async () => {
    const user = userEvent.setup();
    render(<PermissionCatalogue locale="en" />);

    await user.type(screen.getByPlaceholderText('Filter permissions…'), '   role   ');

    // role grants exactly read/create/update/delete, and nothing else survives.
    expect(screen.getByText(/^4 permissions$/)).toBeInTheDocument();
    expect(screen.queryByText(/sales-order/)).not.toBeInTheDocument();
  });

  it('is translated', () => {
    render(<PermissionCatalogue locale="ar" />);
    expect(screen.getByPlaceholderText('تصفية الصلاحيات…')).toBeInTheDocument();
  });

  it('never renders a raw permission string where a page might log it unescaped', () => {
    const { container } = render(<PermissionCatalogue locale="en" />);
    for (const permission of allPermissions) {
      expect(container.textContent).toContain(permission.split(':')[1]);
    }
  });
});
