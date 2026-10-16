'use client';

import { useSession } from './client-session';

/** Hook to get the current user's permissions. */
export function usePermissions() {
  const { session } = useSession();
  return session?.user.permissions ?? [];
}

/** Check if the user has a specific permission. */
export function useHasPermission(permission: string) {
  const permissions = usePermissions();
  return permissions.includes(permission);
}

/** Check if the user has any of the specified permissions. */
export function useHasAnyPermission(permissions: string[]) {
  const userPermissions = usePermissions();
  return permissions.some((p) => userPermissions.includes(p));
}

/** Check if the user has all of the specified permissions. */
export function useHasAllPermission(permissions: string[]) {
  const userPermissions = usePermissions();
  return permissions.every((p) => userPermissions.includes(p));
}
