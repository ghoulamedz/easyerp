'use client';

/**
 * People and their roles.
 *
 * Each row edits in place: roles through `PATCH /users/:id/roles` (the role
 * list comes from `GET /roles`), the Active flag through
 * `PATCH /users/:id/active`, and removal through `DELETE /users/:id` behind a
 * two-click confirm. A refused last-administrator or self change answers 409,
 * and that message lands in the row's inline alert — never in a toast that
 * vanishes before it is read.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Role, User } from '@easyerp/contracts';
import { translatorFor, type Locale } from '../i18n/config';
import { ApiError, apiGet, apiSend } from '../lib/api';
import { useCollection } from '../lib/use-collection';
import { useHasPermission } from '../lib/use-permissions';
import { FilterBar } from './filter-bar';
import { SkeletonRows } from './ui';

function failureMessage(failure: unknown, fallback: string): string {
  if (failure instanceof ApiError || failure instanceof Error) return failure.message;
  return fallback;
}

export function UsersList({ locale }: { locale: Locale }) {
  // The list re-reads through the hook: bumping the key remounts the body,
  // so a successful edit, toggle or removal refetches without touching the
  // fetch core.
  const [listKey, setListKey] = useState(0);
  return <UsersListBody key={listKey} locale={locale} onDone={() => setListKey((key) => key + 1)} />;
}

function UsersListBody({ locale, onDone }: { locale: Locale; onDone: () => void }) {
  const t = translatorFor(locale);
  const result = useCollection<User>('/users');
  const canCreate = useHasPermission('user:create');
  // Always called (hooks order): the permission string is fixed.
  const canUpdate = useHasPermission('user:update');
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  // `GET /users` takes no query, so the search filters the fetched users
  // client-side by display name or email.
  const [q, setQ] = useState('');

  async function toggleActive(user: User): Promise<void> {
    const key = `active:${user.id}`;
    setPending(key);
    setActionError(null);
    try {
      await apiSend(`/users/${user.id}/active`, 'PATCH', { isActive: !user.isActive });
      onDone();
    } catch (failure) {
      setActionError(failureMessage(failure, t('loadFailed')));
    } finally {
      setPending(null);
    }
  }

  async function removeUser(id: string): Promise<void> {
    const key = `remove:${id}`;
    setPending(key);
    setActionError(null);
    try {
      await apiSend(`/users/${id}`, 'DELETE');
      setConfirmRemoveId(null);
      onDone();
    } catch (failure) {
      setActionError(failureMessage(failure, t('loadFailed')));
    } finally {
      setPending(null);
    }
  }

  if (result.state === 'loading') {
    // A skeleton with the shape of the rows, not a line of text: the wait is real on a
    // free-tier database, and a screen that shows its layout reads as working.
    return <SkeletonRows rows={5} className="py-4" />;
  }

  if (result.state === 'failed') {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-ink-muted">{t('loadFailed')}</p>
        <p className="mt-1 text-sm text-ink-muted">{t('tryAgainOrContactSupport')}</p>
      </div>
    );
  }

  const raw = result.data as unknown;
  const rows: readonly User[] = Array.isArray(raw) ? (raw as readonly User[]) : (raw as { items: readonly User[] }).items ?? [];
  const needle = q.trim().toLowerCase();
  const visible =
    needle === ''
      ? rows
      : rows.filter(
          (user) =>
            user.displayName.toLowerCase().includes(needle) ||
            user.email.toLowerCase().includes(needle),
        );
  const clearFilters = () => {
    setQ('');
  };
  const filters = (
    <FilterBar
      locale={locale}
      q={q}
      onQChange={setQ}
      showSearch={true}
      showStatus={false}
      showItemType={false}
      showRole={false}
      searchPlaceholder="filter"
      onClear={needle !== '' ? clearFilters : undefined}
    />
  );

  if (visible.length === 0) {
    return (
      <div>
        {filters}
        <div className="py-8 text-center">
          {needle !== '' ? (
            <>
              <p className="text-sm text-ink-muted">{t('noResults')}</p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:bg-surface-sunken"
              >
                {t('clearFilters')}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-muted">{t('noUsers')}</p>
              {canCreate ? (
                <Link href={`/${locale}/settings/users/new`} className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:bg-surface-sunken">
                  {t('addFirstUser')}
                </Link>
              ) : null}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {filters}
      {canCreate ? (
        <div className="mb-4 flex justify-end">
          <Link href={`/${locale}/settings/users/new`} className="inline-flex items-center justify-center gap-2 rounded-lg border border-transparent bg-brand px-3.5 py-2 text-sm font-medium text-brand-contrast hover:bg-brand-hover">
            {t('newUser')}
          </Link>
        </div>
      ) : null}
      {actionError ? (
        <p role="alert" className="mb-4 text-sm text-danger">
          {actionError}
        </p>
      ) : null}
      <div className="divide-y divide-line">
        {visible.map((user) => (
          <div key={user.id} className="py-4">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <div>
                <p className="font-medium text-ink">{user.displayName}</p>
                <p className="text-sm text-ink-muted">{user.email}</p>
              </div>
              <div className="text-sm text-ink-muted">
                <p className="mb-1">{t('userActive')}</p>
                <p className="font-medium">{user.isActive ? t('yes') : t('no')}</p>
              </div>
              <div className="text-sm text-ink-muted">
                <p className="mb-1">{t('userRoles')}</p>
                <p className="font-medium">
                  {user.roles.map((r) => r.name).join(', ') || '—'}
                </p>
              </div>
            </div>
            {canUpdate ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={pending !== null}
                  onClick={() => {
                    setActionError(null);
                    setConfirmRemoveId(null);
                    setEditingId((current) => (current === user.id ? null : user.id));
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-sunken disabled:opacity-50"
                >
                  {t('userEdit')}
                </button>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-sunken">
                  <input
                    type="checkbox"
                    checked={user.isActive}
                    disabled={pending !== null}
                    onChange={() => void toggleActive(user)}
                    aria-label={`${t('userActive')}: ${user.email}`}
                  />
                  {t('userActive')}
                </label>
                {confirmRemoveId === user.id ? (
                  <>
                    <button
                      type="button"
                      disabled={pending !== null}
                      onClick={() => void removeUser(user.id)}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-danger hover:bg-surface-sunken disabled:opacity-50"
                    >
                      {t('userRemove')}
                    </button>
                    <button
                      type="button"
                      disabled={pending !== null}
                      onClick={() => setConfirmRemoveId(null)}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-sunken disabled:opacity-50"
                    >
                      {t('cancel')}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={pending !== null}
                    onClick={() => {
                      setActionError(null);
                      setEditingId(null);
                      setConfirmRemoveId(user.id);
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-sunken disabled:opacity-50"
                  >
                    {t('userRemove')}
                  </button>
                )}
              </div>
            ) : null}
            {canUpdate && editingId === user.id ? (
              <RolesEditor
                locale={locale}
                user={user}
                onDone={onDone}
                onCancel={() => setEditingId(null)}
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function RolesEditor({
  locale,
  user,
  onDone,
  onCancel,
}: {
  locale: Locale;
  user: User;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = translatorFor(locale);
  const [roles, setRoles] = useState<readonly Role[] | null>(null);
  const [selected, setSelected] = useState<readonly string[]>(user.roles.map((role) => role.id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<unknown>('/roles')
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data)
          ? (data as readonly Role[])
          : ((data as { items?: readonly Role[] }).items ?? []);
        setRoles(list);
      })
      .catch((failure) => {
        if (!cancelled) setError(failureMessage(failure, t('loadFailed')));
      });
    return () => {
      cancelled = true;
    };
    // The role catalogue is read once per editor opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleRole(id: string): void {
    setSelected((prev) => (prev.includes(id) ? prev.filter((role) => role !== id) : [...prev, id]));
  }

  async function save(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      await apiSend(`/users/${user.id}/roles`, 'PATCH', { roleIds: [...selected] });
      onDone();
    } catch (failure) {
      setError(failureMessage(failure, t('loadFailed')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 rounded-lg border border-line bg-surface-sunken p-3">
      {roles === null && error === null ? (
        <p className="text-sm text-ink-muted">{t('loading')}</p>
      ) : null}
      {error ? (
        <p role="alert" className="mb-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {roles !== null ? (
        <div className="flex flex-wrap gap-4">
          {roles.map((role) => (
            <label key={role.id} className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={selected.includes(role.id)}
                disabled={saving}
                onChange={() => toggleRole(role.id)}
              />
              {role.name}
            </label>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={saving || roles === null || selected.length === 0}
          onClick={() => void save()}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-transparent bg-brand px-3 py-1.5 text-sm font-medium text-brand-contrast hover:bg-brand-hover disabled:opacity-50"
        >
          {t('save')}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onCancel}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-sunken disabled:opacity-50"
        >
          {t('cancel')}
        </button>
      </div>
    </div>
  );
}
