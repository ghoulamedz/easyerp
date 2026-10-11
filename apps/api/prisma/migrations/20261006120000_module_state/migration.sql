-- The Module switch (spec 001 story 19).
--
-- Absent rows read as enabled (safe default), so a Business that was provisioned
-- before this table, or restored from a backup of one, is not silently half
-- disabled and needs no backfill. Setup on a fresh deployment writes one row per
-- Module so the state is explicit from the moment the Business exists.

CREATE TABLE IF NOT EXISTS "module_state" (
  "module" VARCHAR(32) NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "module_state_pkey" PRIMARY KEY ("module")
);