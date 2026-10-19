/**
 * The process environment, parsed once at startup. A missing or malformed
 * variable stops the process before it accepts traffic, because a rollout that
 * starts with an unset secret is a rollout that serves a broken Business.
 */

import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3002),
  API_HOST: z.string().min(1).default('0.0.0.0'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(200).default(10),

  /**
   * The token that opens first-run Setup (ADR 0012). Read from the host's own
   * environment. Defaulted only for local use, because a fresh checkout should
   * `pnpm dev` into a working Setup without inventing a secret.
   */
  FIRST_SETUP_TOKEN: z.string().min(8).default('dev-first-setup-token'),

  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  /**
   * The URL the *browser* uses for `/api/auth/*`, which is the web origin: the
   * browser never calls the API directly, it calls same-origin `/api/*` and
   * Next rewrites that to `API_INTERNAL_URL`. Better Auth builds its cookies,
   * its links and its own trusted origin from this value, so naming the API's
   * own hostname here would describe an origin no browser ever presents.
   */
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

  /**
   * Vercel's own variables, read here so nothing outside this file touches
   * `process.env`. Both are absent off Vercel, and `trusted-origins.ts` unions
   * them with `CORS_ORIGINS` when they are present: a per-deployment hostname
   * and the project's stable production domain are both origins a visitor can
   * legitimately arrive from, and neither is knowable when the variable list is
   * written by hand.
   */
  VERCEL_URL: z.string().min(1).optional(),
  VERCEL_PROJECT_PRODUCTION_URL: z.string().min(1).optional(),
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
  if (
    parsed.data.NODE_ENV === 'production' &&
    parsed.data.FIRST_SETUP_TOKEN === 'dev-first-setup-token'
  ) {
    // The default is a development convenience. Accepting it in production means a
    // rollout that omits the token silently ships with a Setup gate anyone can
    // guess, which is the exact door ADR 0012 exists to close.
    throw new Error('FIRST_SETUP_TOKEN must be set to a non-default value in production');
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
