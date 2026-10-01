# Single-tenant schema, no tenant_id

There is no `tenant_id` column anywhere, because there is exactly one Business per database. A column whose value is always the same teaches the code to stop filtering by it, and gives false confidence that isolation is enforced. Moving to shared hosting later is a documented, mechanical migration — add the column, backfill, add the filter in the repository layer — not a rewrite.
