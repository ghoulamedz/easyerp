/**
 * Mapping an auth record plus its role assignments onto the session contract.
 *
 * Pure, so the rules that matter can be tested without a database:
 *
 *   * an account that is not active resolves to nothing at all — there is no
 *     "disabled but valid" state, which is the defect that let a disabled legacy
 *     account keep working for the whole 24 hours of its token;
 *   * a permission outside the catalog invalidates the session rather than being
 *     carried along, so a revoked or renamed permission fails loudly;
 *   * a malformed record is a session that does not exist, not a session with
 *     missing fields.
 */

import { type SessionUser, sessionUserSchema } from '@easyerp/contracts';

export interface RoleAssignment {
  readonly roleId: string;
  readonly permissions: readonly string[];
}

/**
 * Whether a stored auth record may still obtain a session. A removed user
 * keeps its row (soft-delete), so `isActive` alone cannot answer this: the
 * row must also have no `deletedAt`. Both are checked here and not in a
 * guard, so every session resolution enforces the same rule.
 */
export function mayObtainSession(record: unknown): boolean {
  const candidate = record as {
    isActive?: unknown;
    deletedAt?: unknown;
  } | null;
  if (!candidate || typeof candidate !== 'object') return false;
  if (candidate.isActive !== true) return false;
  return candidate.deletedAt === null || candidate.deletedAt === undefined;
}

export function toSessionUser(
  record: unknown,
  assignments: readonly RoleAssignment[],
): SessionUser | null {
  const candidate = record as {
    id?: unknown;
    email?: unknown;
    name?: unknown;
    isActive?: unknown;
    deletedAt?: unknown;
  } | null;
  if (!candidate || typeof candidate.id !== 'string') return null;
  if (!mayObtainSession(candidate)) return null;

  const parsed = sessionUserSchema.safeParse({
    id: candidate.id,
    email: candidate.email,
    displayName: candidate.name,
    isActive: true,
    roleIds: assignments.map((assignment) => assignment.roleId),
    permissions: assignments.flatMap((assignment) => [...assignment.permissions]),
  });

  return parsed.success ? parsed.data : null;
}
