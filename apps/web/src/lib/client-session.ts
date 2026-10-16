'use client';

import { useEffect, useState } from 'react';
import type { SessionUser } from '@easyerp/contracts';

/** The session identity, exactly as the API's guards resolve it. */
export interface ClientSession {
  readonly user: SessionUser;
}

/**
 * Fetch the current session user (including permissions) for client components.
 *
 * Probes `GET /api/auth/get-session` first and reads `GET /api/users/me` —
 * the `SessionUser` the guards enforce — only when a session exists. The
 * probe answers 200 with null when signed out, so a signed-out visitor never
 * issues the `users/me` request whose 401 the browser logs as a console error.
 * The probe's raw shape (`{ session, user: { name, emailVerified, … } }`)
 * carries no `permissions`, so it never substitutes for `users/me`: every
 * `useHasPermission` still reads the guards' `SessionUser`, and a valid token
 * still resolves to the same Add buttons as before.
 */
export async function fetchSession(): Promise<ClientSession | null> {
  try {
    const probe = await fetch(`/api/auth/get-session`, {
      credentials: 'include',
    });
    if (!probe.ok) return null;
    const raw = (await probe.json()) as {
      readonly session?: { readonly userId: string } | null;
    } | null;
    if (!raw || typeof raw !== 'object' || !('session' in raw) || !raw.session) {
      return null;
    }
    const response = await fetch(`/api/users/me`, {
      credentials: 'include',
    });
    if (!response.ok) return null;
    const user = (await response.json()) as SessionUser;
    if (!user || typeof user !== 'object' || !user.id || !Array.isArray(user.permissions)) {
      return null;
    }
    return { user };
  } catch {
    return null;
  }
}

/** Hook to subscribe to session changes. */
export function useSession() {
  const [session, setSession] = useState<ClientSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadSession = async () => {
      setLoading(true);
      const data = await fetchSession();
      if (!cancelled) {
        setSession(data);
        setLoading(false);
      }
    };

    loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  return { session, loading };
}
