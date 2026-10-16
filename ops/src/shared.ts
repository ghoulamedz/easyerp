/**
 * Shared plumbing for the operations commands.
 *
 * Every remote action goes through `ssh` to the host named in the manifest. There
 * is no orchestrator: one Business, one host, one systemd pair, one native
 * PostgreSQL (ADR 0013). Nothing here decides policy — it only executes what the
 * manifest says.
 *
 * The host layout this assumes, and the layout the provisioning script creates:
 *
 *   /home/easyerp/easyerp/        the repository: the release at one commit, built
 *   /home/easyerp/easyerp-api/     the API unit's working dir (dist/, prisma/,
 *                                   node_modules/, .env)
 *   /home/easyerp/easyerp-web/     the web unit's working dir (.next/, public/,
 *                                   node_modules/, .env)
 *   /home/easyerp/backups/         pg_dump output (daily/weekly/monthly)
 *
 * There is no shared env dir: each unit reads its own .env (see the systemd
 * units), and the API's file is the one that holds DATABASE_URL.
 *
 * Nothing here shells out to Docker. That was the old deployment mechanism and
 * `composeCommand` was its single point of contact; it is gone, and PostgreSQL is
 * now the distribution's own package under systemd.
 */

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Client, loadManifest } from './clients.js';

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(here, '..', '..');

/** The manifest lives in the repo so a deployment is reproducible from Git. */
export const MANIFEST_PATH =
  process.env.EASYERP_CLIENTS ?? resolve(REPO_ROOT, 'ops', 'clients.yaml');

/** Where the checked-out release lives on the host. */
export const REMOTE_APP_DIR = process.env.EASYERP_REMOTE_APP_DIR ?? '/home/easyerp/easyerp';
/** The easyerp home that holds the per-service dirs. There is no shared env
 *  dir: each unit reads its own `<service>/.env` (see ops/systemd), so this
 *  only locates the API env file that holds DATABASE_URL. */
export const REMOTE_SHARED_DIR = process.env.EASYERP_REMOTE_SHARED_DIR ?? '/home/easyerp';
/** The environment file both remote probes read DATABASE_URL from. */
export const REMOTE_ENV_FILE = `${REMOTE_SHARED_DIR}/easyerp-api/.env`;
/** `pg_dump` output, in the layout backup.sh writes. */
export const REMOTE_BACKUP_ROOT = process.env.EASYERP_BACKUP_ROOT ?? '/home/easyerp/backups';

export async function clients(): Promise<readonly Client[]> {
  return (await loadManifest(MANIFEST_PATH)).clients;
}

export interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export function run(
  command: string,
  args: readonly string[],
  env?: NodeJS.ProcessEnv,
): Promise<RunResult> {
  return new Promise((resolveRun) => {
    const child = spawn(command, [...args], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', (error) =>
      resolveRun({ code: 127, stdout, stderr: `${stderr}${error.message}` }),
    );
    child.on('close', (code) => resolveRun({ code: code ?? 1, stdout, stderr }));
  });
}

/** Run a command on the client's host. */
export function ssh(client: Client, command: string): Promise<RunResult> {
  return run('ssh', [
    '-o',
    'BatchMode=yes', // never prompt: a deploy must not hang waiting for a password
    '-o',
    'StrictHostKeyChecking=accept-new',
    `${client.sshUser}@${client.host}`,
    command,
  ]);
}

/** The systemd unit for one half of this Business. */
export function unitOf(client: Client, half: 'api' | 'web'): string {
  return `easyerp-${half}.service`;
}

/** A `systemctl` invocation against one unit. */
export function systemctlCommand(
  unit: string,
  verb: string,
  extra: readonly string[] = [],
): string {
  return ['sudo', 'systemctl', verb, unit, ...extra].join(' ');
}

/**
 * The `rsync` arguments that copy the working tree to one host.
 *
 * `node_modules` and `.git` are excluded because the host runs
 * `pnpm install --frozen-lockfile` itself: shipping a `node_modules` built on a
 * different platform is how a deploy works locally and fails on the host.
 *
 * Returned as an argv array rather than a command string because a command string
 * has to be re-split on whitespace to be executed, and a repository path
 * containing a space would silently become two arguments.
 */
export function rsyncArgs(client: Client): readonly string[] {
  return [
    '--archive',
    '--delete',
    '--compress',
    '--exclude=node_modules',
    '--exclude=.git',
    '--exclude=.next',
    '--exclude=dist',
    '--exclude=coverage',
    '--exclude=.turbo',
    // The host's own environment, never ours.
    '--exclude=apps/api/.env',
    '--exclude=apps/api/.env.test',
    // Generated on the host by `prisma generate`, and gitignored so rsync would
    // otherwise carry a client directory full of stale generated code.
    '--exclude=apps/api/src/generated',
    `${REPO_ROOT}/`,
    `${client.sshUser}@${client.host}:${REMOTE_APP_DIR}/`,
  ];
}

/**
 * A shell prefix that exports the host's environment file.
 *
 * `set -a` turns on automatic export, so every variable in the file lands in the
 * environment of the command that follows. `prisma.config.ts` reads
 * `DATABASE_URL` from the environment and its own `dotenv/config` will not
 * overwrite a variable that is already defined — which is what makes this work
 * for a database whose credentials exist only on the host.
 */
export function withHostEnv(command: string): string {
  return `set -a; . ${REMOTE_ENV_FILE}; set +a; ${command}`;
}

export function report(label: string, result: RunResult): boolean {
  const ok = result.code === 0;
  process.stdout.write(`${ok ? 'ok  ' : 'FAIL'} ${label}\n`);
  if (!ok) {
    for (const line of `${result.stderr}${result.stdout}`.trim().split('\n').slice(-8)) {
      process.stdout.write(`     ${line}\n`);
    }
  }
  return ok;
}

export async function main(run_: () => Promise<number>): Promise<void> {
  try {
    process.exitCode = await run_();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  }
}
