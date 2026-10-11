/**
 * Server-side reads against the API (ADR 0015).
 *
 * The session gate in `(app)/layout.tsx` and the entry redirect in
 * `[locale]/page.tsx` are server components: they cannot use the browser's
 * same-origin `/api` proxy, so they address the API directly at
 * `API_INTERNAL_URL` — the same target `next.config.ts` uses for its rewrites,
 * with the same local default. The request's cookie is forwarded, which is the
 * whole point: the gate answers "is anyone signed in" from the session the
 * browser actually holds.
 */

import { headers } from 'next/headers';

function apiBase(): string {
  return process.env.API_INTERNAL_URL ?? 'http://localhost:3002';
}

export async function serverApiGet<T>(path: string): Promise<T | null> {
  const cookie = (await headers()).get('cookie');
  let response: Response;
  try {
    response = await fetch(`${apiBase()}/api${path}`, {
      cache: 'no-store',
      headers: cookie ? { cookie } : {},
    });
  } catch {
    // The API is not answering at all; the caller decides what that means.
    return null;
  }
  if (!response.ok) return null;
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** The shape Better Auth answers `GET /api/auth/get-session` with. */
export interface AuthSession {
  readonly session: { readonly userId: string };
  readonly user: { readonly id: string; readonly email: string };
}

export async function readSession(): Promise<AuthSession | null> {
  const answer = await serverApiGet<AuthSession | null>('/auth/get-session');
  if (!answer || typeof answer !== 'object' || !('session' in answer) || !answer.session) {
    return null;
  }
  return answer as AuthSession;
}

export async function readSetupStatus(): Promise<{ needsSetup: boolean } | null> {
  return serverApiGet<{ needsSetup: boolean }>('/setup/status');
}
