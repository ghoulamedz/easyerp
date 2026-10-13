'use client';

/**
 * The hooks half of the one client (ADR 0015).
 *
 * Split from `api.ts` so the fetch core stays importable from server
 * components — the session gate in `(app)/layout.tsx` uses it, and a module
 * that imports `react` state cannot be read there.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  listCollection,
  type Collection,
  type CollectionQuery,
  type CollectionState,
} from './api';

/**
 * One hook for every list screen: loading, failed (with the ApiError, so a
 * 403 renders "not permitted" in the screen's own words), and ready.
 */
export function useCollection<T>(path: string, query?: CollectionQuery): CollectionState<T> {
  const key = `${path}|${query?.page ?? 1}|${query?.pageSize ?? 25}|${query?.q ?? ''}`;
  const [result, setResult] = useState<CollectionState<T>>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    listCollection<T>(path, query).then(
      (data: unknown) => {
        // Some routes (`/users`, `/roles`, `/settings/*`) return a bare
        // array, not the `{ items, total, … }` envelope. Wrap it so every
        // list screen can read `data.items` without crashing.
        const wrapped = (Array.isArray(data)
          ? { items: data as readonly T[], total: (data as readonly T[]).length, page: 1, pageSize: (data as readonly T[]).length }
          : (data as Collection<T>)) as Collection<T>;
        if (!cancelled) setResult({ state: 'ready', data: wrapped });
      },
      (error: unknown) => {
        if (!cancelled) {
          setResult({
            state: 'failed',
            error:
              error instanceof ApiError
                ? error
                : new ApiError(0, 'REQUEST_FAILED', 'The request could not be completed'),
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // `key` is the whole dependency: one string, no object identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return result;
}

/** Re-read the current query without remounting the screen. */
export function useReload(): [number, () => void] {
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((value) => value + 1), []);
  return [nonce, reload];
}

export type { Collection, CollectionQuery, CollectionState };
