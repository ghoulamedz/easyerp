/**
 * Identity. The user's password and credential hashes never appear in any
 * response shape in this file: the API returns entities, not the ORM rows, so a
 * hash cannot leak through a serializer (the legacy API exposed them).
 */

import { z } from 'zod';
import { permissionSchema } from './permissions.js';

/**
 * The name of the Role guaranteed to exist and to be impossible to remove or
 * strip. A Business can never be left without one (CONTEXT.md).
 */
export const ADMINISTRATOR_ROLE = 'Administrator' as const;

/**
 * The session identity resolved from request headers on every request. It is
 * re-read from the database each time, which is what makes disabling an account
 * or removing a role take effect immediately rather than when a token expires
 * (ADR 0007).
 */
export const sessionUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1).max(255),
  isActive: z.boolean(),
  roleIds: z.array(z.string().min(1)),
  permissions: z.array(permissionSchema),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const roleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  /** Stable code used by code and migrations, e.g. `WAREHOUSE_CLERK`. */
  code: z.string().min(1).max(64),
  permissions: z.array(permissionSchema),
  /** Only the guaranteed Administrator role sets this, and it can never be cleared. */
  isProtected: z.boolean(),
});
export type Role = z.infer<typeof roleSchema>;

export const userSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1).max(255),
  isActive: z.boolean(),
  roles: z.array(roleSchema),
});
export type User = z.infer<typeof userSchema>;

/** What a client may send when creating a user. */
export const userInputSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(255),
  password: z.string().min(8).max(128),
  roleIds: z.array(z.string().min(1)).min(1),
  isActive: z.boolean().default(true),
});
export type UserInput = z.infer<typeof userInputSchema>;

/** A Role assignment as sent by a client: a bundle of catalog permissions. */
export const roleInputSchema = z.object({
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(64),
  permissions: z.array(z.string().min(1)).min(1),
});
export type RoleInput = z.infer<typeof roleInputSchema>;
