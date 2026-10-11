# PostgreSQL runs in the stack, not as a managed service

> **Amended by [ADR 0013](0013-two-deployment-targets.md).** The reasoning below is unchanged and still holds in full: a managed database means one account, one bill and one suspension action that would take every Business offline simultaneously — the exact outcome ADR 0001 exists to prevent — and it moves customer data outside the region we rent. What 0013 changes is scope and packaging. This decision now governs **client data only**: no client's rows live in a managed database. A disposable demo database on Neon is the one carve-out. And production PostgreSQL runs natively under systemd rather than as a container, because the principle was always "we own the database", not "we run Docker".

PostgreSQL runs on each Business's own VPS, rather than as a managed Neon or Supabase project. The accepted cost is that we own backups, major-version upgrades and connection pooling.

## Consequences

- Backups are `pg_dump` runs on the host, and a restore drill proves a dump can be loaded back. An unverified dump is not a backup.
- A major version upgrade is an operation we perform, on one Business at a time, with a tested restore behind it.
- Connection pooling is ours to run in production, where the database is reached over a private socket and a pool is an optimisation rather than a necessity.
