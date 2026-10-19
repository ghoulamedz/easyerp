# One deployment per Business

Each subscribing Business runs its own deployment — its own VPS, its own PostgreSQL, its own domain — built from the same release commit and the same migration history. Shared multi-tenant hosting was rejected because isolation, restore and compliance risk are per Business, and because a failure must reach exactly one Business. The accepted cost is that upgrades are N manual operations, which `ops/deploy.ts` and `ops/status.ts` exist to make tolerable.

"**Read "built from the same release commit" where this says "image".** There is no
container image: `ops/deploy.ts` rsyncs a release commit and builds it on the host. The
point of the sentence is unchanged — a deployment is reproducible because it is built
from one commit and one migration history, not because it was built once and copied.

## Consequences

- Per-Business configuration lives outside the release directory (a shared environment file beside it), so replacing a release never touches a client's branding or secrets.
- The blast radius of any bug is one client, which is why the compatibility matrix in CI matters more here than it would on shared hosting.
