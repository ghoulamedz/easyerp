/**
 * The exact origins that may present a credentialed request to Better Auth and
 * to the CORS layer.
 *
 * A sign-in reaches the API through the web app's `/api/*` rewrite
 * (`apps/web/next.config.ts`), so Better Auth sees the **web** origin even
 * though the request lands on the API. On Vercel the web origin is not one name:
 * every deployment answers on its own hostname (`VERCEL_URL`) and the project
 * also carries a stable production domain
 * (`VERCEL_PROJECT_PRODUCTION_URL`). Vercel injects both at runtime, so they are
 * unioned with `CORS_ORIGINS` here instead of being pinned by hand from
 * `vercel ls` — a hand-pinned list is stale as soon as the next deploy mints a
 * new hostname, and the symptom is a 403 `INVALID_ORIGIN` at sign-in.
 *
 * Exact origins only, never a wildcard: the same rule `CORS_ORIGINS` enforces in
 * `config/env.ts`, because a wildcard plus credentials is a credentialed open
 * door.
 */

export interface OriginSources {
  /** The configured browser origins (`CORS_ORIGINS`, already split by env.ts). */
  readonly corsOrigins: readonly string[];
  /** `VERCEL_URL`: this deployment's hostname, which changes on every deploy. */
  readonly vercelUrl?: string | undefined;
  /** `VERCEL_PROJECT_PRODUCTION_URL`: the project's stable production domain. */
  readonly vercelProjectProductionUrl?: string | undefined;
}

/**
 * The union, deduplicated, as origins (`https://host`, no path, no trailing
 * slash). Entries that are not a parseable origin, or that contain a wildcard,
 * are dropped rather than passed on: a list that accepts anything is worse than
 * a list that is missing one hostname and says so.
 */
export function trustedOrigins(sources: OriginSources): string[] {
  const candidates = [
    ...sources.corsOrigins,
    asHttpsOrigin(sources.vercelUrl),
    asHttpsOrigin(sources.vercelProjectProductionUrl),
  ];

  const origins: string[] = [];
  for (const candidate of candidates) {
    const origin = normalizeOrigin(candidate);
    if (origin !== undefined && !origins.includes(origin)) origins.push(origin);
  }
  return origins;
}

/** Vercel sets these as bare hostnames (`easyerp-web.vercel.app`); the scheme is ours. */
function asHttpsOrigin(host: string | undefined): string | undefined {
  const trimmed = host?.trim();
  if (!trimmed) return undefined;
  return trimmed.includes('://') ? trimmed : `https://${trimmed}`;
}

function normalizeOrigin(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.includes('*')) return undefined;
  try {
    return new URL(trimmed).origin;
  } catch {
    return undefined;
  }
}
