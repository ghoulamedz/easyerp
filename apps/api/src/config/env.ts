/**
 * The process environment, parsed once at startup. A missing or malformed
 * variable stops the process before it accepts traffic, because a rollout that
 * starts with an unset secret is a rollout that serves a broken Business.
 */

import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  API_HOST: z.string().min(1).default('0.0.0.0'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(200).default(10),

  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  BETTER_AUTH_URL: z.url(),
  CORS_ORIGINS: z
    .string()
    .min(1)
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    )
    .refine((origins) => origins.every((origin) => !origin.includes('*')), {
      message:
        'CORS_ORIGINS accepts exact origins, never a wildcard: a wildcard plus credentials is a credentialed open door',
    }),
});

export type Env = z.infer<typeof schema> & { readonly isProduction: boolean };

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${detail}`);
  }
  return Object.freeze({ ...parsed.data, isProduction: parsed.data.NODE_ENV === 'production' });
}

/** The parsed environment for the running process. Call after `loadEnv`. */
export function env(): Env {
  cached ??= loadEnv();
  return cached;
}

/** Replace the cached environment. Tests use this to inject a known environment. */
export function setEnv(next: Env | undefined): void {
  cached = next;
}
