/**
 * `pnpm ops:restore-drill [client-id]`
 *
 * The gate from the risk register: a backup nobody has loaded back is a guess.
 * This takes the newest dump, restores it into a throwaway **database** on the
 * host, checks that the tables a Business depends on came back with their rows,
 * then drops everything it created.
 *
 * The live database is never touched. The drill is expected to fail loudly.
 *
 * Two things changed when PostgreSQL became a native service (ADR 0013). There is
 * no scratch container, so the isolation is a scratch database on the same
 * server. And the tables it looks for are named in `tables.ts`, which is checked
 * against the schema by `tables.test.ts` — the previous version listed Prisma
 * model names, a check that can only ever fail, and which had therefore never
 * been run.
 */

import { type Client, originOf } from './clients.js';
import { clients, main, REMOTE_BACKUP_ROOT, report, ssh } from './shared.js';
import { CRITICAL_TABLES, listTables, MUST_HAVE_ROWS, rowCount, tableExists } from './tables.js';

async function drillClient(client: Client): Promise<boolean> {
  const dbname = 'easyerp';
  const scratch = `easyerp_restore_drill_${client.id}`;
  process.stdout.write(`\n=== restore drill: ${client.id} (${originOf(client)}) ===\n`);

  // 1. Find the newest dump. Nothing to drill is a failure, not a skip.
  const newest = await ssh(
    client,
    `ls -1t ${REMOTE_BACKUP_ROOT}/${client.id}/${dbname}-*.dump 2>/dev/null | head -n 1`,
  );
  const dump = newest.stdout.trim();
  if (newest.code !== 0 || dump === '') {
    process.stdout.write(`FAIL  no backup found for ${client.id}\n`);
    return false;
  }
  process.stdout.write(`dump  : ${dump}\n`);

  // 2. A scratch database. Never the live one, and dropped first so a drill that
  //    died half-way cannot make the next one fail for the wrong reason.
  const cleanup = async (): Promise<void> => {
    await ssh(
      client,
      `sudo -u postgres dropdb --if-exists --force ${scratch} >/dev/null 2>&1 || true`,
    );
  };
  await cleanup();

  const created = await ssh(client, `sudo -u postgres createdb ${scratch}`);
  if (!report('create scratch database', created)) {
    await cleanup();
    return false;
  }

  try {
    // 3. Load the dump.
    const restored = await ssh(
      client,
      `sudo -u postgres pg_restore -d ${scratch} --no-owner --no-privileges < ${dump}`,
    );
    if (!report('restore', restored)) return false;

    // 4. Did every table come back? Compared against the live database rather
    //    than against a hardcoded count, so this check keeps its meaning as the
    //    schema grows and never needs editing with it. The live database is only
    //    read for a table list; it is never written to.
    const [live, restoredTables] = await Promise.all([
      ssh(client, listTables(dbname)),
      ssh(client, listTables(scratch)),
    ]);
    const liveTables = live.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const restoredSet = new Set(
      restoredTables.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    );
    const missing = liveTables.filter((table) => !restoredSet.has(table));
    const extra = [...restoredSet].filter((table) => !liveTables.includes(table));
    if (
      !report(`all ${liveTables.length} tables restored`, {
        code: missing.length === 0 ? 0 : 1,
        stdout: '',
        stderr: missing.length > 0 ? `absent: ${missing.join(', ')}` : '',
      })
    ) {
      return false;
    }
    // A table the live database does not have means the dump came from somewhere
    // else. Loud, because that invalidates the comparison above.
    if (
      !report('no unexpected tables', {
        code: extra.length === 0 ? 0 : 1,
        stdout: '',
        stderr: extra.length > 0 ? `present only in the dump: ${extra.join(', ')}` : '',
      })
    ) {
      return false;
    }

    // 5. Each table a Business depends on must have come back, and the counts are
    //    printed because an operator reading a drill wants to see the data, not
    //    just a verdict. Only `business` is required to be populated; the rest
    //    are legitimately empty on a healthy instance.
    let healthy = true;
    for (const table of CRITICAL_TABLES) {
      const present = await ssh(client, tableExists(table, scratch));
      if (present.code !== 0 || present.stdout.trim() !== 't') {
        process.stdout.write(`FAIL  table ${table} missing from the restore\n`);
        healthy = false;
        continue;
      }
      const count = await ssh(client, rowCount(table, scratch));
      const rows = count.code === 0 ? count.stdout.trim() : '?';
      process.stdout.write(`        ${table}: ${rows} rows\n`);
      if (MUST_HAVE_ROWS.includes(table) && Number(rows) < 1) {
        process.stdout.write(`FAIL  table ${table} came back empty\n`);
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

    // 6. Every migration that was applied must have finished. A dump taken while
    //    a migration was in flight contains a row with finished_at NULL, which is
    //    a truncated schema that looks fine until the next release queries it.
    const migrated = await ssh(
      client,
      `sudo -u postgres psql -d ${scratch} -tAc "SELECT migration_name || '|' || CASE WHEN finished_at IS NULL THEN 'FAILED' ELSE 'ok' END FROM _prisma_migrations ORDER BY started_at"`,
    );
    const applied = migrated.stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('|'));
    const failed = applied.filter(([, state]) => state !== 'ok');
    if (
      !report(`${applied.length} migrations recorded, none failed`, {
        code: migrated.code === 0 && failed.length === 0 ? 0 : 1,
        stdout: '',
        stderr: failed.map(([name]) => `${name} did not finish`).join('; '),
      })
    ) {
      return false;
    }

    return true;
  } finally {
    await cleanup();
    process.stdout.write(`      scratch database ${scratch} dropped\n`);
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
