-- Catalog CRUD and Party commercial terms (spec 001 stories 25–32).
--
-- Two groups of statements, both purely additive.
--
-- First, the terms a Customer carries (story 30). These are nullable columns so
-- a supplier-only Party simply has none, and every statement is guarded so a
-- re-run is a no-op.
--
-- Second, search-as-you-type (story 32). `contains` is an `ilike '%…%'`, which a
-- btree cannot serve — the plan is a sequential scan of every row the Business
-- has recorded matter of how short the query is. A trigram GIN index turns that
-- into an index scan for any query of three or more characters. Prisma cannot
-- express a column type GIN index, so both it and the extension it needs are
-- written here, after the same pattern as `custom_record_values_gin_idx`.

ALTER TABLE "party"
  ADD COLUMN IF NOT EXISTS "paymentTermDays" INTEGER,
  ADD COLUMN IF NOT EXISTS "creditLimit" DECIMAL(18,3),
  ADD COLUMN IF NOT EXISTS "deliveryAddress" VARCHAR(500);

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- The extension is cluster-wide but the indexes below are guarded, so the
-- migration stays replayable on a database that already has both.
CREATE INDEX IF NOT EXISTS "item_code_trgm_idx" ON "item" USING GIN ("code" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "item_name_trgm_idx" ON "item" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "party_code_trgm_idx" ON "party" USING GIN ("code" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "party_name_trgm_idx" ON "party" USING GIN ("name" gin_trgm_ops);