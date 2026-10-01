# PostgreSQL runs in the stack, not as a managed service

PostgreSQL runs as a container in the same Docker Compose stack as the API on each Business's VPS, rather than as a managed Neon or Supabase project. A managed database means one account, one bill and one suspension action that would take every Business offline simultaneously — the exact outcome ADR 0001 exists to prevent — and it moves customer data outside the region we rent. The accepted cost is that we own backups, major-version upgrades and connection pooling.
