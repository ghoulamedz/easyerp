import { useEffect, useState } from 'react';
import { apiGet } from './api';

/** The shape of the session user returned by GET /api/auth/get-session. */
export interface ClientSession {
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly displayName: string;
    readonly isActive: boolean;
    readonly roleIds: readonly string[];
    readonly permissions: readonly string[];
  };
}

/** Fetch the current session user (including permissions) for client components. */
export async function fetchSession(): Promise<ClientSession | null> {
  try {
    const response = await fetch(`/api/auth/get-session`, {
      credentials: 'include',
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data || typeof data !== 'object' || !('user' in data)) return null;
    return data as ClientSession;
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

    // TODO: Consider using websockets or polling for real-time updates
    // For now, we just load once on mount
    return () => {
      cancelled = true;
    };
  }, []);

  return { session, loading };
}
