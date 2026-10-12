# 2026-10-12 — first run on a new machine (Omarchy host)

## What was done

Diagnosed why `pnpm dev` would not build/run on a freshly set-up machine (new Omarchy
install, `node v26.8.2`, `pnpm 10.18.2`, `docker 29.7.2`).

## Strongest findings

`pnpm dev` = `pnpm db:up && turbo run dev`, so it dies at the first step. Three
independent causes, in the order they bite:

1. **The user is not in the `docker` group.** `id` shows `medo wheel`, the socket is
   `root:docker 660`, and `docker.sock` is therefore unreachable:
   `permission denied while trying to connect to the docker API`. `scripts/db.mjs up`
   dies on `docker compose … up -d --wait`. This is the only blocker that needs a
   password — `sudo usermod -aG docker medo` plus a re-login. The daemon itself is fine:
   `docker.socket` is active, so dockerd socket-activates on first connection.
2. **`apps/api/.env` did not exist.** It is gitignored, so a fresh checkout never has it.
   `apps/api/src/config/env.ts` rejects startup without `DATABASE_URL`,
   `BETTER_AUTH_SECRET` (≥32 chars) and `BETTER_AUTH_URL`; the `dev` script only loads it
   via `--env-file-if-exists`, so the symptom is a NestJS crash *after* the database is
   up, not a missing-file error. Recreated it, mirroring `.env.test` but pointed at the
   `easyerp` database, with a generated local `BETTER_AUTH_SECRET`.
3. **The Prisma client had never been generated.** `apps/api/src/generated/` (the schema's
   `output`) was absent, so every `import … from './generated/prisma'` would fail at
   `nest start`. Fixed with `pnpm db:generate`.

Non-blockers confirmed: Node 26 satisfies `engines >= 24`; `pnpm -v` matches
`packageManager: pnpm@10.18.2`; `node_modules` was already installed. The pnpm warning
`The "pnpm" field in package.json is no longer read` is real drift — `pnpm.onlyBuiltDependencies`
now belongs in `pnpm-workspace.yaml` — but harmless: it only re-enables build scripts for
Prisma/esbuild on `pnpm install`.

## Unresolved questions

- Whether `usermod -aG docker` was applied and `pnpm dev` was observed green end to end
  (ports 3002/3003) — it could not be, without the password for sudo.

## Next steps

- Re-login after the group change, then `pnpm dev`; expect PostgreSQL on 55432, API on
  3002, web on 3003.
- Optionally move `pnpm.onlyBuiltDependencies` to `pnpm-workspace.yaml` to clear the warning.
