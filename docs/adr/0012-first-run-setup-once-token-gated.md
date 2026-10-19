# First-run setup is a one-time, token-gated write path; later schema changes arrive as backfill migrations

A fresh deployment has no Business, no User and therefore nothing to sign in to, so the first visit has to create them. Setup opens exactly once in the life of a database, only while `count(Business) = 0`, evaluated inside the same transaction that creates the first Business under a `pg_advisory_xact_lock` so two simultaneous visitors cannot both win; the route requires `FIRST_SETUP_TOKEN` from the host's `.env`, and it returns 404 permanently once a Business exists. It creates a Business, its first Administrator User with a password that person chooses, a Number pattern for every Document type, at least one Unit of measure, and at least one Tax rate when the VAT regime is `STANDARD` — nothing less, because a Business with no Unit, no Tax rate or no numbering pattern is a Business whose first invoice cannot be issued. Afterwards, configuration is ordinary authenticated Settings work, never a wizard. Deployments do not reopen setup: `ops/deploy.ts` runs unattended across every client, so a path that reopens on each push would re-expose an unauthenticated write to all instances at once, and a client URL is guessable from the domain. When a later release makes a new setting required, a versioned migration fills it with a safe default and advances `business.provisionedVersion`; the release that would break a client is one that adds a required field with no default, and that release does not ship.

## Consequences

- The token is single-use and read from the host's `.env`, never committed. Consuming it writes an `AuditEntry` whose actor is null, because the person completing setup has no User yet — the one event in the audit trail with no actor, and it is the only legitimate one.
- Because the setup form grows over time, a Business provisioned on an older version is completed by backfill rather than by re-running setup; Settings stays permanently available under `business-settings:update` so backfill guarantees nothing is _missing_ without ever having to reopen the path.
- **Every issued document is covered by the database dump.** There is no archived PDF
  and no file beside the row (ADR 0010): an invoice's number, party, lines and totals
  are columns, `ops/backup.sh` dumps the database daily, and `pnpm ops:restore-drill`
  proves the dump loads. The record that answers an inspection is the printed A4 page,
  so the Business discharges the ten-year obligation by filing the paper, and a
  reprint reproduces the figures from the row.
- Setup's guard is a count, not a flag, so restoring a backup that already contains a Business closes setup without any manual step, and a Business can never be provisioned twice by any means including a direct database edit.
