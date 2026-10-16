/**
 * The one client every screen reads and writes through (ADR 0015).
 *
 * Client components fetch through this module, never through bare `fetch`:
 * the error shape is parsed once here (`{ error: { code, message } }` into an
 * `ApiError { status, code, message }`), a 401 sends the browser to sign-in,
 * and a 403 becomes a "not permitted" state the caller renders — the API
 * refuses regardless, hiding a button is only a courtesy.
 *
 * Pagination and search travel in the URL's search params (`page`, `pageSize`,
 * `q`), so a filtered list is bookmarkable and the back button behaves.
 * No cache layer: there is no cache to invalidate, so React Query/SWR stay out.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  get notPermitted(): boolean {
    return this.status === 403;
  }
}

interface ErrorBody {
  error?: { code?: unknown; message?: unknown };
}

/** Where sign-in lives for the locale in the current pathname. */
function signInPath(): string {
  if (typeof window === 'undefined') return '/fr/sign-in';
  const segment = window.location.pathname.split('/')[1];
  const locale = segment === 'en' || segment === 'ar' ? segment : 'fr';
  return `/${locale}/sign-in`;
}

function toSearch(params?: Record<string, string | number | undefined>): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const text = search.toString();
  return text === '' ? '' : `?${text}`;
}

async function request<T>(
  path: string,
  init: RequestInit & { params?: Record<string, string | number | undefined> },
): Promise<T> {
  const response = await fetch(`/api${path}${toSearch(init.params)}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });

  if (response.status === 401 && typeof window !== 'undefined') {
    // The session is gone: the next request would fail the same way, so go to
    // sign-in rather than rendering a page that cannot load.
    window.location.assign(signInPath());
    throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required');
  }

  if (!response.ok) {
    let code = 'REQUEST_FAILED';
    let message = `Request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as ErrorBody;
      if (typeof body.error?.code === 'string') code = body.error.code;
      if (typeof body.error?.message === 'string') message = body.error.message;
    } catch {
      // A proxy or gateway answered without JSON; the status is the signal.
    }
    // Localize here, at the single choke point every screen reads through:
    // server messages arrive in English, the interface language lives on
    // <html lang>, and no caller should have to remember to translate.
    const { localizeErrorMessage } = await import('./error-messages');
    throw new ApiError(response.status, code, localizeErrorMessage(code, message));
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function apiGet<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  return request<T>(path, params === undefined ? { method: 'GET' } : { method: 'GET', params });
}

export function apiSend<T>(
  path: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  body?: unknown,
): Promise<T> {
  return request<T>(
    path,
    body === undefined ? { method } : { method, body: JSON.stringify(body) },
  );
}

/* -------------------------------------------------------------------------- */
/* Collections                                                                */
/* -------------------------------------------------------------------------- */

export interface Collection<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface CollectionQuery {
  readonly page?: number;
  readonly pageSize?: number;
  readonly q?: string;
  readonly status?: string;
  readonly itemType?: string;
  readonly role?: string;
}

/** A paged list in the `{ items, total, page, pageSize }` envelope. */
export function listCollection<T>(path: string, query?: CollectionQuery): Promise<Collection<T>> {
  return apiGet<Collection<T>>(path, {
    ...(query?.page !== undefined ? { page: query.page } : {}),
    ...(query?.pageSize !== undefined ? { pageSize: query.pageSize } : {}),
    ...(query?.q !== undefined && query.q !== '' ? { q: query.q } : {}),
    ...(query?.status !== undefined && query.status !== '' ? { status: query.status } : {}),
    ...(query?.itemType !== undefined && query.itemType !== '' ? { itemType: query.itemType } : {}),
    ...(query?.role !== undefined && query.role !== '' ? { role: query.role } : {}),
  });
}

export type CollectionState<T> =
  | { readonly state: 'loading' }
  | { readonly state: 'failed'; readonly error: ApiError }
  | { readonly state: 'ready'; readonly data: Collection<T> };