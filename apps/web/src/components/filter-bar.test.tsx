/**
 * @vitest-environment jsdom
 *
 * FilterBar: the one filter row every list screen renders. Search and each
 * dropdown report through their callbacks, the options reuse the shared keys
 * (All/Draft/Issued/Cancelled, the item types, the party roles), and the
 * clear button appears only while a filter is active.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterBar } from './filter-bar';

function renderFull(
  overrides: {
    readonly q?: string;
    readonly onClear?: (() => void) | undefined;
  } = {},
) {
  const onQChange = vi.fn();
  const onStatusChange = vi.fn();
  const onItemTypeChange = vi.fn();
  const onRoleChange = vi.fn();
  const onClear = vi.fn();
  render(
    <FilterBar
      locale="en"
      q=""
      onQChange={onQChange}
      status=""
      onStatusChange={onStatusChange}
      itemType=""
      onItemTypeChange={onItemTypeChange}
      role=""
      onRoleChange={onRoleChange}
      showSearch={true}
      showStatus={true}
      showItemType={true}
      showRole={true}
      searchPlaceholder="filter"
      onClear={onClear}
      {...overrides}
    />,
  );
  return { onQChange, onStatusChange, onItemTypeChange, onRoleChange, onClear };
}

describe('FilterBar', () => {
  it('renders every dropdown with its All-first options', () => {
    renderFull();

    const status = screen.getByLabelText('Filter by status');
    expect(status).toHaveValue('');
    expect(screen.getByRole('option', { name: 'All statuses' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Draft' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Issued' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Cancelled' })).toBeInTheDocument();

    expect(screen.getByLabelText('Filter by type')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'All types' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Raw Material' })).toBeInTheDocument();

    expect(screen.getByLabelText('Filter by role')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'All roles' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Customer' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Supplier' })).toBeInTheDocument();
  });

  it('reports search text and dropdown choices through the callbacks', async () => {
    const user = userEvent.setup();
    const { onQChange, onStatusChange, onItemTypeChange, onRoleChange } = renderFull();

    await user.type(screen.getByPlaceholderText('Filter'), 'acme');
    expect(onQChange).toHaveBeenCalled();

    await user.selectOptions(screen.getByLabelText('Filter by status'), 'DRAFT');
    expect(onStatusChange).toHaveBeenCalledWith('DRAFT');

    await user.selectOptions(screen.getByLabelText('Filter by type'), 'SERVICE');
    expect(onItemTypeChange).toHaveBeenCalledWith('SERVICE');

    await user.selectOptions(screen.getByLabelText('Filter by role'), 'CUSTOMER');
    expect(onRoleChange).toHaveBeenCalledWith('CUSTOMER');
  });

  it('hides the clear button while no filter is active', () => {
    renderFull();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  it('shows the clear button while a filter is active and resets through it', async () => {
    const user = userEvent.setup();
    const { onClear } = renderFull({ q: 'acme' });

    const clear = screen.getByRole('button', { name: 'Clear filters' });
    await user.click(clear);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('shows no clear button without an onClear handler even when filtered', () => {
    renderFull({ q: 'acme', onClear: undefined });
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });
});
