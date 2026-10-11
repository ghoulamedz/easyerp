/**
 * `pnpm ops:status [client-id]`
 *
 * Answers the two questions an operator actually asks: is it serving, and what is
 * running. Read-only — it changes nothing, so it is safe to run at any time.
 *
 * `is-ready` is the local probe against the public origin; the systemd unit state
 * is the remote truth. They are reported separately on purpose: a host can have
 * both units active and still be failing to serve, because the units only
 * guarantee that Node is running, not that it can reach PostgreSQL.
 */

import { type Client, isReady, originOf } from './clients.js';
import { clients, main, ssh, systemctlCommand, unitOf } from './shared.js';

async function statusOf(client: Client): Promise<boolean> {
  const origin = originOf(client);
  const ready = await isReady(origin);

  process.stdout.write(`\n=== ${client.id} ===\n`);
  process.stdout.write(`origin : ${origin}\n`);
  process.stdout.write(`ready  : ${ready ? 'yes' : 'no'}\n`);

  // `is-active` exits non-zero when a unit is stopped, which is information, not
  // a failure of this command. The exit code is read rather than relied upon.
  for (const half of ['api', 'web'] as const) {
    const unit = unitOf(client, half);
    const active = await ssh(client, systemctlCommand(unit, 'is-active'));
    const since = await ssh(
      client,
      systemctlCommand(unit, 'show', ['-p', 'ActiveEnterTimestamp', '--value']),
    );
    const state = active.stdout.trim() || 'unknown';
    process.stdout.write(
      `  ${unit}: ${state}${state === 'active' && since.code === 0 ? ` since ${since.stdout.trim()}` : ''}\n`,
    );
  }

  // PostgreSQL is a third systemd unit on the host, and its state is the usual
  // explanation for an API that is active but not ready.
  const pg = await ssh(client, systemctlCommand('postgresql.service', 'is-active'));
  process.stdout.write(`  postgresql.service: ${pg.stdout.trim() || 'unknown'}\n`);

  return ready;
}

await main(async () => {
  const only = process.argv[2];
  const manifest = await clients();
  const selected = only ? manifest.filter((client) => client.id === only) : manifest;

  if (selected.length === 0) {
    process.stderr.write(`no client named "${only}" in the manifest\n`);
    return 1;
  }

  let allReady = true;
  for (const client of selected) {
    if (!(await statusOf(client))) allReady = false;
  }
  return allReady ? 0 : 1;
});
