#!/usr/bin/env node
/**
 * The connection string a migration, dump or restore must use.
 *
 * `DATABASE_URL` is the **pooled** string: the one the application uses for
 * ordinary traffic. `DATABASE_URL_UNPOOLED` is the **direct** string.
 *
 * They are two names for the same database, and which one you need depends on
 * what you are doing. A serverless function needs the pooled one, because it
 * opens many short-lived connections and PostgreSQL has a hard limit on how
 * many may exist. A migration, `pg_dump` or a restore needs the direct one,
 * because PgBouncer in transaction mode does not carry session state —
 * `prepared statement "s0" already exists` from Prisma Migrate, or a `SET
 * search_path` that evaporates before the next statement, are both that bug.
 *
 * Production PostgreSQL is native and unpooled, so it has one string and no
 * second variable. Falling back is therefore correct rather than a convenience:
 * it is the only correct answer for a target that has nothing to pool.
 *
 * Prisma 7 cannot express this itself. `prisma.config.ts` accepts `url` and
 * `shadowDatabaseUrl` and nothing else; `directUrl` was removed along with the
 * rest of the datasource block. So the rule cannot live in configuration and
 * has to live in the callers — which is why every one of them comes through
 * here instead of reading `process.env.DATABASE_URL` directly.
 */

/**
 * @param {NodeJS.ProcessEnv} [env] the environment to read, so a test can supply
 *   its own rather than the shell's.
 * @returns {string} the direct connection string.
 * @throws if neither variable is set. Guessing is how a migration ends up
 *   running against the wrong database, which is worse than stopping.
 */
export function directDatabaseUrl(env = process.env) {
  const url = env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'Neither DATABASE_URL_UNPOOLED nor DATABASE_URL is set. A migration needs a ' +
        'direct connection string; application traffic uses the pooled DATABASE_URL.',
    );
  }
  return url;
}
