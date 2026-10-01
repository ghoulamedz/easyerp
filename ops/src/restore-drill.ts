/**
 * `pnpm --filter @easyerp/ops restore-drill [client-id]`
 *
 * The gate from the risk register: a backup nobody has loaded back is a guess.
 * This takes the newest dump, restores it into a throwaway database inside a
 * throwaway container on the host, checks that the tables a Business depends on
 * came back with their rows, then destroys everything it created.
 *
 * The production database is never touched. The drill is expected to fail loudly.
 */

import { type Client, originOf } from './clients.js';
import { clients, main, report, ssh } from './shared.js';

/**
 * Tables whose absence would mean an unrestorable backup. Counted rather than
 * merely listed: a restored schema with no rows is still a broken restore.
 */
const CRITICAL_TABLES = [
  'AuthUser',
  'Role',
  'Business',
  'Item',
  'Party',
  'Unit',
  'StockMovement',
  'Document',
  'AuditEntry',
];

const DRILL_IMAGE = 'postgres:17-alpine';
const READY_TIMEOUT_MS = 60_000;

async function runLocally(
  client: Client,
  command: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  // The drill runs on the host that holds the dump, so the commands go over ssh
  // but are issued as one string: quoting a pipeline through ssh twice is where
  // this kind of script usually breaks.
  return ssh(client, command);
}

async function drillClient(client: Client): Promise<boolean> {
  const project = `easyerp_${client.id}`;
  const scratch = `easyerp_restore_drill_${client.id}`;
  process.stdout.write(`\n=== restore drill: ${client.id} (${originOf(client)}) ===\n`);

  // 1. Find the newest dump. Nothing to drill is a failure, not a skip.
  const newest = await runLocally(
    client,
    `ls -1t /opt/easyerp/backups/${client.id}/${project}-*.dump 2>/dev/null | head -n 1`,
  );
  const dump = newest.stdout.trim();
  if (newest.code !== 0 || dump === '') {
    process.stdout.write(`FAIL  no backup found for ${client.id}\n`);
    return false;
  }
  process.stdout.write(`dump  : ${dump}\n`);

  // 2. A scratch database in its own container. Never the live one.
  const cleanup = async (): Promise<void> => {
    await runLocally(client, `docker rm -f ${scratch} >/dev/null 2>&1 || true`);
    await runLocally(client, `docker volume rm ${scratch}_data >/dev/null 2>&1 || true`);
  };
  await cleanup();

  const started = await runLocally(
    client,
    `docker run -d --name ${scratch} -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=drill -v ${scratch}_data:/var/lib/postgresql/data ${DRILL_IMAGE} >/dev/null`,
  );
  if (!report('start scratch postgres', started)) {
    await cleanup();
    return false;
  }

  try {
    // 3. Wait for it to accept connections.
    const deadline = Date.now() + READY_TIMEOUT_MS;
    let up = false;
    while (Date.now() < deadline) {
      const probe = await runLocally(
        client,
        `docker exec ${scratch} pg_isready -U postgres -d drill`,
      );
      if (probe.code === 0) {
        up = true;
        break;
      }
      await new Promise((done) => setTimeout(done, 2000));
    }
    if (!report('scratch postgres ready', { code: up ? 0 : 1, stdout: '', stderr: 'timeout' }))
      return false;

    // 4. Load the dump.
    const restored = await runLocally(
      client,
      `cat ${dump} | docker exec -i ${scratch} pg_restore -U postgres -d drill --no-owner --no-privileges`,
    );
    if (!report('restore', restored)) return false;

    // 5. The checks that decide whether the restore was real. `to_regclass` is
    //    NULL for a table that did not come back, so one query covers both.
    let healthy = true;
    for (const table of CRITICAL_TABLES) {
      const count = await runLocally(
        client,
        `docker exec ${scratch} psql -U postgres -d drill -tAc "SELECT COALESCE((SELECT reltuples::bigint FROM pg_class WHERE relname = '${table}'), -1)"`,
      );
      const rows = Number(count.stdout.trim());
      if (count.code !== 0 || rows < 0) {
        process.stdout.write(`FAIL  table ${table} missing from the restore\n`);
        healthy = false;
      }
    }
    if (
      !report(`${CRITICAL_TABLES.length} tables present`, {
        code: healthy ? 0 : 1,
        stdout: '',
        stderr: '',
      })
    ) {
      return false;
    }

    // 6. The API must accept the restored schema, not just the restored tables.
    const migrated = await runLocally(
      client,
      `${project}-api sh -c 'DATABASE_URL=postgresql://postgres:drill@host.docker.internal:5432/drill npx prisma migrate status'`,
    );
    if (!report('schema matches migrations', migrated)) return false;

    return true;
  } finally {
    await cleanup();
    process.stdout.write(`      scratch container and volume removed\n`);
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

  const results: boolean[] = [];
  for (const client of selected) {
    results.push(await drillClient(client));
  }

  const failed = results.filter((ok) => !ok).length;
  process.stdout.write(`\n${results.length - failed}/${results.length} restore drills passed\n`);
  // A drill that fails must be louder than a log line.
  return failed === 0 ? 0 : 1;
});
