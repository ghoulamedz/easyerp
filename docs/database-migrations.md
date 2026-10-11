# Database migrations, and why this repository has them

A migration is a numbered, permanent instruction that changes a database's structure or contents by one step, recorded in a file that is committed to Git.

That is the whole definition. Everything below is consequences of it.

## The problem it solves

Your application and your database are two things that must agree, and only one of them is easy to redeploy.

Application code is replaced by uploading new files. A database is replaced by uploading a file next to the old one, and the old one still holds a Business's invoices. If the code now expects a `documents` table and the database has never heard of it, the application crashes on the first request. If the database has the table but the code is the old version, the old code may crash instead.

So the two must move together, in order, on every machine, forever — including the machines nobody is watching, including a database that was empty an hour ago and one that has ten years of invoices in it.

## The three things, and why there are three

| Thing        | Where it lives                               | What it is                                             |
| ------------ | -------------------------------------------- | ------------------------------------------------------ |
| The schema   | `apps/api/prisma/schema.prisma`              | The shape you _want_: models, fields, types, relations |
| The history  | `apps/api/prisma/migrations/*/migration.sql` | Ordered steps that get you from nothing to that shape  |
| The database | PostgreSQL                                   | The shape you _have_                                   |

`schema.prisma` is a wish. `migrations/` is the path from one reality to another. The database is where you are.

Keeping the middle one is the entire point. If you only kept the schema, you would have to reconstruct the path each time, and there is no way to do that: adding a column and dropping it leaves no trace, so a database that has been alive for a year cannot tell you what order its changes happened in. Nor can it tell you whether you already dropped it.

### How the database knows what it has already done

Prisma creates a table called `_prisma_migrations`. Each row is one applied migration: its name, a checksum of the SQL, when it finished, whether it succeeded.

On every `migrate deploy`, Prisma reads that table, works out which files in `migrations/` are not listed, and applies only those, in order, inside a transaction each. That is why `migrate deploy` is safe to run ten times: the tenth run finds nothing to do.

The checksum is the other half. If you edit a migration that has already been applied, the checksum no longer matches, and Prisma reports that the history was rewritten. This is not bureaucracy — it is the mechanism that makes the next instruction possible.

## The commands, and the one rule that separates them

### `prisma generate` — not a migration at all

It reads `schema.prisma` and writes a type-safe client into `apps/api/src/generated/`. No database is contacted. It changes no table.

This is the single most common confusion, and this repository makes it worse because `apps/api/src/generated/` is gitignored — so the build depends on `generate` having been run, and the directory is absent on a fresh clone. Every build command and every Vercel build must run it first.

### `prisma migrate dev` — development only

Compares `schema.prisma` against the development database, works out the difference, writes a new `migration.sql`, and applies it. It is interactive: it asks before dropping a column, because dropping a column destroys data.

It also guards against the two ways to be wrong. It refuses if the database has been changed by hand and does not match the history, and it refuses to run if it would lose data without being told to.

**Never run `migrate dev` in CI or on a deployed database.** It can prompt, and a prompt in an unattended deploy is a hang. That is the entire reason `migrate deploy` exists.

### `prisma migrate deploy` — the deployment command

Applies pending migrations and nothing else. No prompts, no new migrations, no drift check. It is the only command that belongs in CI, in a release step, or on a client's server.

### `prisma migrate reset` — drops everything and reapplies

Every table is deleted and every migration is replayed. Convenient, and completely destructive. It is for a development database you own.

This repository has a database named `easyerp` for that. It also has `easyerp_test`, which `pnpm test:integration` empties between tests, and `apps/api/src/identity/__tests__/harness.ts` refuses to run against any database whose name does not look disposable — precisely because the difference between the two is a name, and a name is easy to get wrong at 5pm on a Friday.

### `prisma migrate diff` — writes SQL without a database

Produces the SQL for a schema change using only two schema files, with no database connection. This is how the first migration in this repository was generated before any database existed.

## The golden rule

**A migration that has run anywhere is immutable. You may add a new one; you may never edit, reorder or delete an applied one.**

Every deployed copy of the code carries every migration ever written. A client who has been running for eight months has a table whose name is a checksum of an old file. Editing that file changes what the ninth month's code believes happened, and no database can reconcile the two stories.

When a migration turns out to be wrong on a live database, the repair is a new migration that undoes it. Not an edit. The history is not a description of what you meant; it is a record of what happened, and a record that has been rewritten is worthless.

This is also why a migration must not branch. No `if` on environment, no "only in production". A migration runs on the demo, on your laptop, and on a client's server, in that order, and it must mean the same thing in all three or one of them is wrong.

## Drift: the failure this prevents

Drift is the database and the history disagreeing. It happens when someone edits the live database by hand, or changes `schema.prisma` and ships the code without ever creating a migration.

Both databases now look plausible and neither is reproducible. `migrate dev` will refuse to help, because it cannot tell whether the difference is a forgotten migration or an out-of-band edit. Recovering requires `migrate diff` against the real schema and a hand-written corrective migration.

The rule that prevents it: `schema.prisma` and `migrations/` change in the same commit, or not at all.

## Adding a field later

The rule from ADR 0012, restated as a migration rule: **a migration that runs against a database with rows may never leave a new required field empty.**

A new column needs a default, or it needs to be nullable, or every existing row fails to satisfy it. A release that adds a required field with no default does not ship — it is the one migration that breaks a client who did nothing wrong.

The companion vocabulary term is **Backfill**: a later migration that fills a Setting a newer release made required, with a safe default, on a Business set up before that release existed. `business.provisionedVersion` is the counter that tells you which release a Business was provisioned under, so a migration can tell whether it needs to backfill.

## What a greenfield deployment actually does

This repository has never run against a database holding client data, and that makes the first production deploy the easy case.

A migration is a step, and an empty database is a database with zero of the steps applied. `migrate deploy` finds every file, applies them in order, and ends at the current schema. There is nothing to reconcile and nothing to backfill — no Business exists, so there is nothing to fill in.

So the first production deploy is exactly this, and it is the same command as the hundredth:

```bash
pnpm db:migrate
```

which resolves the **direct** connection string and runs `prisma migrate deploy`. It is a one-off step in `ops/deploy.ts` that completes before any unit restarts, for the same reason it is separate on the demo: a migration that half-applies and is then rolled back leaves the previous release serving traffic against a schema it does not understand. Stopping instead is the intended failure, because the alternative is silent corruption.

## The one trap specific to the demo

The demo's database is Neon, which issues **two** connection strings for the same database:

- `DATABASE_URL` — **pooled**, hostname ends in `-pooler`, routes through PgBouncer. This is what the application uses, because a serverless function opens many short-lived connections and PostgreSQL caps how many may exist.
- `DATABASE_URL_UNPOOLED` — **direct**. This is what migrations, `pg_dump` and restores use.

Running a migration over the pooled string fails with `prepared statement "s0" already exists`, because PgBouncer in transaction mode cannot keep a prepared statement alive across transactions. The error names neither pooling nor the connection string, so it reads like a Prisma bug.

Prisma 7 cannot fix this for you: `prisma.config.ts` accepts `url` and `shadowDatabaseUrl` and nothing else, and `directUrl` was removed from the datasource block. So `scripts/direct-url.mjs` holds the rule and every migration path calls it. Production has no pooler and one string, which is why falling back to `DATABASE_URL` is correct rather than convenient.

See [ADR 0013](adr/0013-two-deployment-targets.md).
