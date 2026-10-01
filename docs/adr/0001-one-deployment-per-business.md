# One deployment per Business

Each subscribing Business runs its own deployment — its own VPS, its own PostgreSQL, its own domain — built from the same image and the same migration history. Shared multi-tenant hosting was rejected because isolation, restore and compliance risk are per Business, and because a failure must reach exactly one Business. The accepted cost is that upgrades are N manual operations, which `ops/deploy.ts` and `ops/status.ts` exist to make tolerable.

## Consequences

- Per-Business configuration lives outside the image (a mounted YAML file and environment variables), so swapping an image never touches a client's branding or secrets.
- The blast radius of any bug is one client, which is why the compatibility matrix in CI matters more here than it would on shared hosting.
