-- Drift reconciliation for a fresh replay.
--
-- 20261006111950 originally carried this ALTER, but it sorted BEFORE 20261006120000,
-- which is where module_state is actually created: a fresh database replayed the folder
-- in name order and failed. The ALTER lives here now, after the table exists.

ALTER TABLE "module_state" ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);
