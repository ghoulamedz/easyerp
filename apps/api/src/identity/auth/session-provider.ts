/**
 * The port through which the API learns who is calling.
 *
 * Better Auth is reached only through this interface. Its official Nest
 * integration is community-maintained and an alternative package is alpha, so
 * the dependency is confined to `better-auth.provider.ts`: if that integration
 * has to change, this file and the guards stay put (ADR 0007).
 *
 * The session is re-read on every request rather than trusted from the token.
 * That re-read is what makes disabling an account, removing a role and revoking
 * a session take effect on the *next* request — the legacy system kept a disabled
 * account working for the full 24 hours of its token's life.
 */

import type { SessionUser } from '@easyerp/contracts';

export const SESSION_PROVIDER = Symbol('SESSION_PROVIDER');

export interface SessionProvider {
  /**
   * Resolve the caller from request headers.
   *
   * Returns null for an absent, expired or unknown session. An account that is
   * no longer active resolves to null as well: there is no "disabled but still
   * valid" state to represent.
   */
  resolve(headers: Record<string, string | string[] | undefined>): Promise<SessionUser | null>;
}

/** Headers a session can arrive in, in priority order. */
export function readSessionHeaders(headers: Record<string, string | string[] | undefined>): {
  cookie: string | undefined;
  authorization: string | undefined;
} {
  const cookie = headers.cookie;
  const authorization = headers.authorization;
  return {
    cookie: Array.isArray(cookie) ? cookie.join('; ') : cookie,
    authorization: Array.isArray(authorization) ? authorization[0] : authorization,
  };
}
