# One deployment per Business

Each subscribing Business runs its own deployment — its own VPS, its own PostgreSQL, its own domain — built from the same release commit and the same migration history. Shared multi-tenant hosting was rejected because isolation, restore and compliance risk are per Business, and because a failure must reach exactly one Business. The accepted cost is that upgrades are N manual operations, which `ops/deploy.ts` and `ops/status.ts` exist to make tolerable.

> **Amended by [ADR 0013](0013-two-deployment-targets.md).** There is no container image, so "built from the same image" is now "built from the same release commit and the same migration history". Everything else here is unchanged: still one Business, one host, one database.

## Consequences

- Per-Business configuration lives outside the release directory (a shared environment file beside it), so replacing a release never touches a client's branding or secrets.
- The blast radius of any bug is one client, which is why the compatibility matrix in CI matters more here than it would on shared hosting.
