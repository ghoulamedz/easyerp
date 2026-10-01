/**
 * `pnpm --filter @easyerp/ops deploy [client-id]`
 *
 * Order matters and is the whole point of this script: migrate first, then swap
 * the containers, then wait for readiness. A rolling upgrade that starts the new
 * API against the old schema will refuse to serve, and that is the intended
 * failure — the alternative is silent corruption.
 *
 * Every client's migrations run to completion before any container is replaced,
 * so a failure part-way through leaves the previous version serving traffic.
 */

import { type Client, isReady, originOf } from './clients.js';
import { clients, composeCommand, main, report, ssh } from './shared.js';

const READY_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 3_000;

async function waitForReady(client: Client): Promise<boolean> {
  const origin = originOf(client);
  const deadline = Date.now() + READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (await isReady(origin)) return true;
    await new Promise((done) => setTimeout(done, POLL_INTERVAL_MS));
  }
  return false;
}

async function deployClient(client: Client): Promise<boolean> {
  process.stdout.write(`\n=== ${client.id} (${originOf(client)}) ===\n`);

  // 1. Apply migrations against the running database, before anything restarts.
  const migrate = await ssh(
    client,
    `${composeCommand(client, 'run', ['--rm', 'api', 'pnpm', 'prisma:migrate:deploy'])}`,
  );
  if (!report('migrate', migrate)) return false;

  // 2. Replace the application containers. Postgres is left running: it is the
  //    one service whose restart would be a self-inflicted outage.
  const up = await ssh(
    client,
    `${composeCommand(client, 'up', ['-d', '--build', 'api', 'web', 'caddy'])}`,
  );
  if (!report('up', up)) return false;

  // 3. Only report success once the new version answers /api/ready itself.
  const ready = await waitForReady(client);
  if (
    !report('ready', {
      code: ready ? 0 : 1,
      stdout: '',
      stderr: `${originOf(client)}/api/ready never answered 200`,
    })
  ) {
    return false;
  }

  return true;
}

await main(async () => {
  const only = process.argv[2];
  const manifest = await clients();
  const selected = only ? manifest.filter((client) => client.id === only) : manifest;

  if (selected.length === 0) {
    process.stderr.write(`no client named "${only}" in the manifest\n`);
    return 1;
  }

  const results: boolean[] = [];
  for (const client of selected) {
    results.push(await deployClient(client));
  }

  const failed = results.filter((ok) => !ok).length;
  process.stdout.write(`\n${results.length - failed}/${results.length} deployed\n`);
  // Non-zero so a CI or an operator's shell notices.
  return failed === 0 ? 0 : 1;
});
