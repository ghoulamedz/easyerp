-- Runs once, on first initialisation of an empty data directory.
--
-- Two databases, on purpose:
--
--   easyerp        the development database. `pnpm dev` runs against it and your
--                  rows survive.
--   easyerp_test   the integration-test database. The suite TRUNCATEs every table
--                  between tests, so it must never be the same database you are
--                  developing against.
--
-- The names differ by `_test`, which is also what the harness refuses to run
-- against: an unset or wrong DATABASE_URL fails loudly instead of emptying the
-- wrong database.
--
-- If you are reading this because `easyerp_test` is missing: the data directory
-- was not empty when the container started, so the script was skipped. Run
-- `pnpm db:reset` to drop the volume and let it run again.
SELECT 'CREATE DATABASE easyerp_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'easyerp_test')\gexec
