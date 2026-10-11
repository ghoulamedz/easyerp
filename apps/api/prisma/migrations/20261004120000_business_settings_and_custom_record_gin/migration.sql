-- The Settings the API resolves for every Document, and the index ADR 0008 promises.
--
-- Both are additions with safe defaults, which is what keeps the release rule in
-- ADR 0012 true: a release that made a required Setting with no default would
-- break a Business that was set up before it existed, and that release does not
-- ship. Every statement is guarded so a re-run is a no-op.

-- `provisionedVersion` starts at 1. A Business provisioned after this release
-- stores the version its Setup ran against, which is 1, so it needs no Backfill.
-- A Business that predates the column gets the same 1 and is expected to be
-- checked against 1 at startup.
ALTER TABLE "business"
  ADD COLUMN IF NOT EXISTS "vatRegime" VARCHAR(16) NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN IF NOT EXISTS "currency" CHAR(3) NOT NULL DEFAULT 'TND',
  ADD COLUMN IF NOT EXISTS "provisionedVersion" INTEGER NOT NULL DEFAULT 1;

-- Filtering a Custom Record by a Custom Field is a jsonb containment query:
--   WHERE values @> '{"colour": "red"}'
-- Without a GIN index that is a sequential scan over every row the Business has
-- ever entered, so the cost of the feature grows with the data instead of with
-- the query. `jsonb_path_ops` is the smaller, faster operator class and is all a
-- containment filter needs. Prisma cannot express an index on a JsonB column, so
-- it is written here and the schema comment says so.
CREATE INDEX IF NOT EXISTS "custom_record_values_gin_idx"
  ON "custom_record" USING GIN ("values" jsonb_path_ops);