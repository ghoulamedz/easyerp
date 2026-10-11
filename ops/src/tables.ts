/**
 * What the restore drill expects to find in a dump.
 *
 * These live apart from `restore-drill.ts` for two reasons. Importing the drill
 * would run it, because it acts at the top level. And the list needs to be
 * checkable against the schema, which is the only thing that can tell us the
 * names are real — see `tables.test.ts`.
 */

/**
 * Tables whose absence would mean an unrestorable backup.
 *
 * These are `@@map` values — lowercase and snake_case — because Prisma's model
 * names are not what `pg_class` holds. An earlier version checked model names
 * (`AuthUser`, `Item`, …), which is a check that can only ever fail and which
 * therefore had never been run.
 *
 * The list is the subset that exists in the schema today. Every table that
 * exists in the database must be listed here, or the restore drill will not
 * verify it. The test in `tables.test.ts` enforces this.
 */
export const CRITICAL_TABLES: readonly string[] = [
  // Auth (Better Auth)
  'auth_user',
  'auth_session',
  'auth_account',
  'auth_verification',
  // Identity
  'role',
  'user_role',
  // Business
  'business',
  // Settings
  'unit',
  'tax_rate',
  'number_pattern',
  'number_series',
  'label',
  'module_state',
  'field_definition',
  'custom_record',
  // Catalog
  'item',
  'party',
  // Documents (polymorphic: one table per ADR 0014)
  'document',
  'document_line',
  'document_tax_group',
  // Credit Note
  'credit_note',
  // Delivery Note
  'delivery_note',
  'delivery_note_line',
  // Purchase Order
  'purchase_order',
  'purchase_order_line',
  // Goods Receipt
  'goods_receipt',
  'goods_receipt_line',
  // Production
  'bom',
  'bom_version',
  'bom_version_line',
  'production_order',
  'production_order_line',
  // Inventory
  'stock_ledger_entry',
  'reservation',
  'discrepancy',
  // Payments
  'payment',
  'payment_allocation',
  // Audit
  'audit_entry',
];

/**
 * The tables a restore must not merely bring back but must bring back *populated*.
 *
 * Kept to one table on purpose. An earlier version tried to assert a row count for
 * every table, using `reltuples` — and `pg_dump` does not dump planner statistics,
 * so every table in a freshly restored database reads as `-1`. That check could
 * only ever fail, which is the same defect as checking a table that does not
 * exist.
 *
 * `business` is the one row that a deployed instance cannot be without: first-run
 * Setup creates the Business before the API serves anything (ADR 0012). Zero
 * Business rows means the restore lost the tenant, and no amount of schema being
 * intact makes that instance startable. Every other table is genuinely allowed to
 * be empty — there is no seed yet, and `label`, `custom_record`, `field_definition`
 * and `auth_session` are empty on a healthy fresh install.
 */
export const MUST_HAVE_ROWS: readonly string[] = ['business'];

/**
 * Lists the tables a database actually has, so two databases can be compared.
 *
 * `pg_tables` rather than `pg_class`, because `pg_class` also lists indexes,
 * sequences and the toast tables. The comparison this feeds is about tables.
 */
export function listTables(database: string): string {
  return `sudo -u postgres psql -d ${database} -tAc "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"`;
}

/**
 * Whether a table came back at all.
 *
 * `to_regclass` yields NULL for a name that resolves to nothing, which turns
 * existence into a boolean in one query. The schema is named explicitly so a
 * table in another schema with the same name cannot satisfy the check.
 */
export function tableExists(table: string, database: string): string {
  return `sudo -u postgres psql -d ${database} -tAc "SELECT COALESCE(to_regclass('public.${table}') IS NOT NULL, false)"`;
}

/**
 * The actual number of rows in a table.
 *
 * A real `count(*)`, not `reltuples`. The estimate is free but meaningless on a
 * restored database, and this runs against a scratch copy where a full scan costs
 * nothing that matters.
 */
export function rowCount(table: string, database: string): string {
  return `sudo -u postgres psql -d ${database} -tAc "SELECT count(*) FROM public.${table}"`;
}
