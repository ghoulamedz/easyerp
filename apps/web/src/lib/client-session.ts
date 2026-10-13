import { useEffect, useState } from 'react';
import type { SessionUser } from '@easyerp/contracts';

/** The session identity, exactly as the API's guards resolve it. */
export interface ClientSession {
  readonly user: SessionUser;
}

/**
 * Fetch the current session user (including permissions) for client components.
 *
 * Reads `GET /api/users/me` — the `SessionUser` the guards enforce — never
 * Better Auth's raw `get-session`, which knows nothing about our roles. That
 * raw shape (`{ session, user: { name, emailVerified, … } }`) has no
 * `permissions`, so every `useHasPermission` returned false and every Add
 * button hid while the token sat valid in cookies.
 */
export async function fetchSession(): Promise<ClientSession | null> {
  try {
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
