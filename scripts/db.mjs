#!/usr/bin/env node
/**
 * One PostgreSQL for local development and integration tests.
 *
 *   pnpm db:up      start it, apply the migrations to both databases
 *   pnpm db:down    stop it, keep the data
 *   pnpm db:reset   stop it and throw the data away
 *   pnpm db:migrate re-apply the migrations without restarting anything
 *
 * Two databases on purpose. `pnpm dev` runs against `easyerp` and its rows
 * survive; `pnpm test:integration` empties every table between tests, so it runs
 * against `easyerp_test`. Merging them would mean a test run deletes the Business
 * you were working on, which is why `harness.ts` also refuses any database whose
 * name does not look disposable.
 *
 * The migrations are applied here rather than left as a step to remember. The
 * integration suite has never run in this repository's history, and "the tests
 * failed because you forgot a migration" is indistinguishable from "the tests
 * failed because the code is wrong". Every one of those tests can be assumed to
 * have been skipped, and a skipped test that reports green is a lie.
 */

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { directDatabaseUrl } from './direct-url.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const API = resolve(ROOT, 'apps/api');
const COMPOSE = resolve(ROOT, 'infra/compose/compose.local.yaml');

/** Where `pnpm dev` connects. Must match `apps/api/.env`. */
const DEV_URL = 'postgresql://easyerp:easyerp@localhost:55432/easyerp?schema=public';
/** Where `pnpm test:integration` connects. Must match `apps/api/.env.test`. */
const TEST_URL = 'postgresql://easyerp:easyerp@localhost:55432/easyerp_test?schema=public';

function docker(...args) {
  execFileSync('docker', ['compose', '-f', COMPOSE, ...args], { stdio: 'inherit', cwd: ROOT });
}

/**
 * Applies the migrations with `DATABASE_URL` set to the *direct* string.
 *
 * Set explicitly rather than inherited, because `prisma.config.ts` reads
 * `DATABASE_URL` from the environment and `dotenv/config` will not overwrite a
 * variable that is already defined. On the demo that is the difference between
 * a migration that applies and one that dies on `prepared statement "s0"
 * already exists`. The helper resolves it rather than trusting the caller.
 */
function migrate(url) {
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: API,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url },
  });
}

/**
 * Migrates both local databases, in that order.
 *
 * Two databases on purpose: `easyerp_test` is emptied by `resetDatabase()` between
 * integration tests, so migrating it here is what makes `pnpm test:integration`
 * work without a separate setup step. The development database goes first because
 * it is the one a human is waiting to use.
 */
function migrateBoth() {
  migrate(DEV_URL);
  migrate(TEST_URL);
}

/**
 * Migrates whatever database the environment points at, using the direct string.
 *
 * This is the path a deployment takes. It is separate from `migrateBoth` so that
 * `pnpm db:migrate` means "bring the database I am pointed at up to date" and
 * never means "connect to a hardcoded localhost".
 */
function migrateTarget() {
  migrate(directDatabaseUrl());
}

const commands = {
  up() {
    // `--wait` blocks until the healthcheck passes, so the migration below never
    // races a Postgres that is still starting.
    docker('up', '-d', '--wait');
    migrateBoth();
    console.log('\nPostgreSQL is up on localhost:55432.');
    console.log('  easyerp        development — already migrated');
    console.log('  easyerp_test   integration — already migrated\n');
    console.log('Next: pnpm dev, or pnpm test:integration.');
  },
  down() {
    docker('down');
  },
  reset() {
    // `-v` drops the volume, which is what re-runs `init/01-create-test-database.sql`.
    // That script only runs against an empty data directory, so this is also the
    // fix for a missing `easyerp_test` database.
    docker('down', '-v');
    console.log('\nData directory removed. `pnpm db:up` starts from empty.');
  },
  migrate: migrateBoth,
  'migrate:target': migrateTarget,
};

const command = process.argv[2];

if (!command || !(command in commands)) {
  console.error(`Usage: pnpm db:<command>\n\n  ${Object.keys(commands).join('\n  ')}`);
  process.exit(1);
}

commands[command]();
