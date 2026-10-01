/**
 * `pnpm --filter @easyerp/ops status [client-id]`
 *
 * Answers the two questions an operator actually asks: is it serving, and what is
 * running. Read-only — it changes nothing, so it is safe to run at any time.
 */

import { type Client, isReady, originOf } from './clients.js';
import { clients, composeCommand, main, ssh } from './shared.js';

async function statusOf(client: Client): Promise<void> {
  const origin = originOf(client);
  const ready = await isReady(origin);

  process.stdout.write(`\n=== ${client.id} ===\n`);
  process.stdout.write(`origin : ${origin}\n`);
  process.stdout.write(`ready  : ${ready ? 'yes' : 'no'}\n`);

  const ps = await ssh(
    client,
    composeCommand(client, 'ps', ['--format', 'table {{.Service}}\\t{{.State}}\\t{{.Status}}']),
  );
  for (const line of ps.stdout.trim().split('\n')) {
    process.stdout.write(`  ${line}\n`);
  }
  if (ps.code !== 0) {
    process.stdout.write(
      `  (compose ps unavailable: ${ps.stderr.trim().split('\n').slice(-1)[0] ?? 'ssh failed'})\n`,
    );
  }
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
    if (!(await isReady(originOf(client)))) allReady = false;
    await statusOf(client);
  }
  return allReady ? 0 : 1;
});
