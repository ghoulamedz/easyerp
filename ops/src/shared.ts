/**
 * Shared plumbing for the operations commands.
 *
 * Every remote action goes through `ssh` to the host named in the manifest. There
 * is no orchestrator: one Business, one host, one port, one `docker compose`
 * project. Nothing here decides policy — it only executes what the manifest says.
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

/** The compose project directory on the remote host. */
export const REMOTE_COMPOSE_DIR = process.env.EASYERP_REMOTE_DIR ?? '/opt/easyerp';

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

/**
 * The compose invocation for one Business.
 *
 * The client's identity and published port are passed on the command line rather
 * than read from the host's `.env`, so this manifest is the single source of
 * truth and a host cannot drift away from it unnoticed.
 */
export function composeCommand(
  client: Client,
  verb: string,
  extra: readonly string[] = [],
): string {
  const project = `easyerp_${client.id}`;
  return [
    `EASYERP_CLIENT_ID=${client.id}`,
    `EASYERP_PORT=${client.port}`,
    `EASYERP_EMAIL_DOMAIN=${client.emailDomain}`,
    'docker compose',
    '--project-name',
    project,
    '--file',
    `${REMOTE_COMPOSE_DIR}/infra/compose/compose.yaml`,
    ...(verb ? [verb] : []),
    ...extra,
  ].join(' ');
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
