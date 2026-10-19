# Two deployment targets: a managed database for the demo, a native one for every client

easyERP runs on two named targets, and the application is identical on both.

**The demo target** is Vercel — the web app and the API as two projects in the same account — with a Neon free-tier PostgreSQL. It exists to show the product to a prospect on a real URL. It is not a Business, holds no client data, and can be deleted without consequence.

**The production target** is one VPS per Business, with PostgreSQL installed from the distribution package and run by systemd, the API and web app run as systemd units from a built release, and Caddy as a native binary terminating TLS. No Docker, and no container registry, because the VPS is already rented and a second subscription buys nothing that `systemd` and `pg_dump` do not already do.

This narrows ADR 0002 rather than overturning it. That ADR forbade a managed database on two grounds: one account, one bill and one suspension action would take every Business offline at once, and client data would sit outside the region we rent. Both grounds are about **client data**, and both are untouched — no client's rows ever live in Neon. The demo is the single carve-out, because its data is ours, is worthless, and is destroyed by deleting the project. What changes is that ADR 0002's _mechanism_ was never the point: it said "runs as a container in the same Docker Compose stack", and production PostgreSQL now runs natively under systemd instead. The principle was always "we own the database"; only the packaging moved.

The constraint that makes this safe is that **no code branches on the target**. There is no `if (isVercel)`. The only things that differ between the two targets are the value of `DATABASE_URL` and where TLS terminates; every line of application code, every migration, and every test are identical. A deployment that needs a code change to move targets has stopped being one codebase.

One connection-string fact does differ, and it is the sharpest edge in this ADR. Neon issues two strings for the same database: a **pooled** one whose hostname carries the `-pooler` suffix and routes through PgBouncer in transaction mode, and a **direct** one without it. Normal application traffic needs the pooled string, because a serverless function opens many short-lived connections and PostgreSQL has a hard connection limit. Migrations, `pg_dump`, logical replication and anything relying on `SET` need the direct string, because PgBouncer in transaction mode does not carry session state. Running Prisma Migrate over the pooled string fails with `prepared statement "s0" already exists` — an error that names neither pooling nor the URL, and that we would have spent a day on.

Prisma 7 removed `directUrl` from its configuration: `prisma.config.ts` accepts only `url` and `shadowDatabaseUrl`, and `url` is read from the environment. There is therefore no field to set and no way for the configuration to know which of the two strings it was handed. The discipline has to live in the commands instead, so it is stated as a rule about naming: **`DATABASE_URL` is pooled and `DATABASE_URL_UNPOOLED` is direct.** Every migration, dump, restore and drill resolves the direct string through one shared helper that prefers `DATABASE_URL_UNPOOLED` and falls back to `DATABASE_URL`, because production native PostgreSQL has no pooler and only one string. Application code reads only `DATABASE_URL` and never sees which it is.

Migrations never run inside an application bootstrap. On the demo they are a CI step or a local command; on production they are a step in `ops/deploy.ts` that completes before any unit is restarted. A serverless cold start that attempted `migrate deploy` would race every concurrent cold start onto the same schema, and a rolled-back deploy that left a half-applied migration would leave the previous release serving traffic against a schema it does not understand — which is the intended failure, because the alternative is silent corruption.

## Consequences

- ADR 0001's "built from the same image" becomes "built from the same release commit and the same migration history". There is no image, so `ops/deploy.ts` rsyncs a commit, builds on the host, and restarts two systemd units. Per-Business configuration lives in `/opt/easyerp/shared/.env`, outside the release directory, so replacing a release never touches a client's secrets.
- `ops/` stops shelling out to `docker compose` entirely. `shared.ts` loses `composeCommand`; `backup.sh` calls the host's `pg_dump`; `restore-drill.ts` restores with `pg_restore` against the same host.
- Docker survives in exactly one place: `infra/compose/compose.local.yaml`, the PostgreSQL used by `pnpm dev` and `pnpm test:integration`. It is not a deployment mechanism and must not grow into one.
- With no image to build, CI has no container-image job, and `infra/docker/` is deleted rather than left to rot unbuilt. A gate that proves a Dockerfile still works is worthless once nothing runs it, and the Docker Compose production stack is deleted for the same reason: it referenced a Prisma CLI the API image did not contain, so its `migrate` service could never have worked.
- The web app's `output: 'standalone'` is removed. Standalone exists to copy a minimal server and its traced dependencies into a container image; with no image, it also makes `next start` — which is what the systemd unit runs — unsupported, so Next warns on every boot.
- The browser gate starts the real API in front of the real web build. It previously started only Next.js and satisfied every `/api` request with a `page.route` stub, so "Opérationnel" was proved against a response the test itself had written. The gate now fails when the proxy target is wrong, when the API refuses to start on an invalid environment, or when `/api/ready` stops reporting the database.
- Because the demo's database is disposable and Neon branches are cheap, the demo is also where migrations get rehearsed. `ops/restore-drill` proves a production dump loads; a Neon branch proves a new migration applies to production-shaped data before it reaches a client.
- Production PostgreSQL is one major version behind whatever is newest, on purpose: `apt` gives us a supported version with security updates, and an untested major upgrade on a client's only database is a worse outcome than running the older one.
- The `demo` entry in `ops/clients.yaml` names a placeholder host that does not exist. It is not a deploy target and must not be deployed to; the demo deploys to Vercel by a different route.

## Amendment: one more configured difference, and why it is not a branch

**Amended again: the document archive is gone, and with it the third difference.** This ADR
used to list filed document copies as a target difference — production kept them under
`DOCUMENT_ARCHIVE_ROOT`, the demo in Vercel Blob, chosen by whether a blob token was
supplied rather than by asking which platform was running. That was a correct
implementation of ADR 0010 and it rested on a premise ADR 0010 has since retracted: the
artifact is not a file we render but the row we store and the page the visitor prints, so
there is nothing to file and no storage backend to choose. The only two differences left
are the two this ADR was written about — the connection string, and Neon's pooler.

The rule it illustrated still holds and is worth keeping for the next such case:
**a difference is a configuration fact, not a target check.** The archive chose its
backend by reading whether a token had been supplied — nothing asked which platform it
ran on, one interface had two implementations, and both deployments executed the same
services.

`DATABASE_URL` and TLS termination are now the whole list of things one deployment
supplies and the other does not. They are in `env.ts` with the rest of the environment,
so the list stays enumerable — the point of the rule was never that the list is short, it
was that the list is explicit and that no branch reaches into business logic.
