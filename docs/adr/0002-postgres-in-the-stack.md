# PostgreSQL runs in the stack, not as a managed service

> This decision governs **client data only**: no client's rows live in a managed database.
A disposable demo database on Neon is the one carve-out — its data is ours, is worthless,
and disappears with the project. The reasoning below holds in full for every client: a
managed database means one account, one bill and one suspension action that would take
every Business offline simultaneously, which is the exact outcome ADR 0001 exists to
prevent, and it moves customer data outside the region we rent.

Production PostgreSQL therefore runs on the client's own host. How it is packaged is not
a decision this ADR makes: a distribution package under systemd is the default because it
is one service with one config file, and a container is acceptable where it is genuinely
the better tool. The principle was always "we own the database", never "we run Docker".

PostgreSQL runs on each Business's own VPS, rather than as a managed Neon or Supabase project. The accepted cost is that we own backups, major-version upgrades and connection pooling.

## Consequences

- Backups are `pg_dump` runs on the host, and a restore drill proves a dump can be loaded back. An unverified dump is not a backup.
- A major version upgrade is an operation we perform, on one Business at a time, with a tested restore behind it.
- Connection pooling is ours to run in production, where the database is reached over a private socket and a pool is an optimisation rather than a necessity.
