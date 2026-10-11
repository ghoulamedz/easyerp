/**
 * Loads the committed integration-test environment before any spec is imported.
 *
 * The specs import `harness.ts`, which reads `DATABASE_URL` at module load and
 * refuses anything that is not a disposable database. Loading here rather than
 * in the npm script means the suite behaves identically whether it is started by
 * pnpm, by turbo, or by CI, and it does not depend on where a package manager
 * happens to place a binary.
 *
 * A value already present in the environment is left alone, which is how CI
 * points the suite at its own service container. That precedence is not assumed:
 * `process.loadEnvFile` fills only the variables the environment does not already
 * define, and does not throw on a duplicate. Measured on Node 24.21.0.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ENV_FILE = resolve(process.cwd(), '.env.test');

if (existsSync(ENV_FILE)) {
  process.loadEnvFile(ENV_FILE);
}

export {};
