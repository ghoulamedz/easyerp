# easyERP demo on free tier — Vercel + Neon (click-by-click)

Demo-only path (disposable data, costs nothing). Client data never lives here
(ADR 0013). Production is a separate VPS path — see `DEPLOY.md` "Production Deployment".

> Source of truth: repo-root `DEPLOY.md` (note: there is **no** `docs/DEPLOY.md`;
> guides that point there are stale), `.github/workflows/deploy-demo.yml`
> (automated route), `apps/api/vercel.json`, `apps/web/next.config.ts`,
> `apps/api/src/config/env.ts`, `apps/api/src/main.serverless.ts`,
> `docs/database-migrations.md`.

## What you end up with

| Piece | Where | Notes |
|---|---|---|
| Postgres | Neon free tier, branch `demo` | Pooled URL for the app, direct URL for migrations |
| API | Vercel project `easyerp-api`, root `apps/api` | Serverless, Vercel entry `api/index.mjs` (ESM) dynamically imports `dist/main.serverless.js` |
| Web | Vercel project `easyerp-web`, root `apps/web` | Next.js, proxies `/api/*` → API URL |

## Steps

### A. Neon (console.neon.tech)

1. **Create project `easyerp-demo`.** Region: closest to you. Note the **Project ID**
   (Neon dashboard → Settings). Postgres 17 if offered.
2. **Create role `easyerp`.** The workflow asks Neon for a connection string with
   `--role easyerp`, so the role must exist first: Neon dashboard → Roles →
   New Role → name `easyerp`. (Missing from `DEPLOY.md` — without it the
   `neonctl connection-string --role easyerp` step fails.)
3. **Create API key.** Account → API Keys → New key, name `easyerp-demo-deploy`.
   Save as `NEON_API_KEY`. Copy the **Project ID** as `NEON_PROJECT_ID`.
4. **Know your two strings.** Same database, two hostnames: pooled (hostname
   contains `-pooler`, PgBouncer) → app runtime `DATABASE_URL`; direct
   (no `-pooler`) → migrations only (`DATABASE_URL_UNPOOLED`). Migrating over
   the pooled string fails with `prepared statement "s0" already exists`
   (see `docs/database-migrations.md`).

### B. Vercel — two projects, one repo

5. **Import repo → project `easyerp-api`.** Framework: **Other**. Root Directory:
   `apps/api`. Build Command:

   ```sh
   pnpm --filter @easyerp/contracts build &&
     pnpm --filter @easyerp/api prisma:generate &&
     pnpm --filter @easyerp/api build
   ```

   Output Directory: `dist`. Install Command: `pnpm install --frozen-lockfile`.
   (Matches `apps/api/vercel.json` + `apps/api/package.json` `build` script,
   which runs `tsc` then copies `src/generated` into `dist/` — so `prisma
   generate` must run before build; the workflow does this locally and
   `vercel.json` repeats it in Vercel's own remote build.)
6. **Import repo again → project `easyerp-web`.** Framework: **Next.js**
   (auto-detected). Root Directory: `apps/web`. Leave build/output defaults
   (`next build`). No `vercel.json` needed for web — `next.config.ts`
   `rewrites()` already proxies `/api/:path*` to `API_INTERNAL_URL`.
7. **Note both project IDs and your org ID.** Project → Settings → General →
   Project ID; org slug/ID from org settings or `vercel.com/account/tokens`
   page. Create a token at `vercel.com/account/tokens` → `VERCEL_TOKEN`.

### C. Environment variables (Vercel dashboard, per project, `Production`)

8. **API project (`easyerp-api`) — set all of these** (required by
   `apps/api/src/config/env.ts`; a missing one crashes boot):
   - `DATABASE_URL` = Neon **pooled** string
   - `BETTER_AUTH_SECRET` = `openssl rand -base64 48` (min 32 chars)
   - `BETTER_AUTH_URL` = **web project URL**, e.g.
     `https://easyerp-web-<org>.vercel.app` — the same origin as `CORS_ORIGINS`.
     The browser never calls the API directly: it calls same-origin `/api/*`
     (including `/api/auth/*`) and Next rewrites that to `API_INTERNAL_URL`. So
     the URL the browser uses for auth is the Web's, and that is what Better Auth
     must build its cookies, links and implicit trusted origin from. Naming the
     API's own hostname here describes an origin no browser presents.
   - `CORS_ORIGINS` = the **web origin** exactly (comma-separated, **no
     wildcards** — `env.ts` refuses `*`). For a stable production deploy use the
     project's production domain, e.g.
     `https://easyerp-web-<org>.vercel.app`, not a per-deployment hostname.
     - **Why this failed before (403 `{"code":"INVALID_ORIGIN"}` at sign-in):**
       `deploy-demo.yml` took the API and Web URLs from `vercel ls`, whose first
       entry is a *per-deployment* hostname; `vercel deploy --prod` mints a new
       one on every run, so the visitor's real `Origin` was absent from
       `trustedOrigins` and Better Auth answered 403. The workflow now resolves
       the Web project's stable production domain (Vercel API
       `targets.production.alias`) and writes that, and it writes
       `BETTER_AUTH_URL` from the same value instead of from the API's URL.
     - **Runtime safety net (no workflow needed):** Vercel injects `VERCEL_URL`
       (this deployment) and `VERCEL_PROJECT_PRODUCTION_URL` (the project's
       stable domain) into the function. `apps/api/src/identity/auth/
       trusted-origins.ts` unions both with `CORS_ORIGINS` (exact origins only,
       no wildcards) and the same list drives Express CORS, so a new deployment
       hostname cannot break sign-in and CORS cannot disagree with the origin
       check. Setting `CORS_ORIGINS` by hand stays required; the union only adds
       names Vercel already owns.
     - A rejection now names itself: the API logs one line at warn level,
       `[auth] origin rejected: <origin> is not in trustedOrigins [...]`.
   - `FIRST_SETUP_TOKEN` = `openssl rand -base64 32` (must differ from
     `dev-first-setup-token` or production boot throws)
   - `NODE_ENV` = `production`
   - **Nothing else for printing.** The paper of every document is rendered from
     its row on request and printed by the visitor's browser, so this deployment
     needs no renderer, no archive and no storage bucket. There is deliberately no
     `DOCUMENT_ARCHIVE_ROOT` and no Blob token: a copy filed in `/tmp` would be a
     404 one request later, and a copy filed anywhere else would be a second source
     of truth that can disagree with the row.
   - Optional: `API_PORT=3000`, `API_HOST=0.0.0.0`, `LOG_LEVEL=info`,
     `DATABASE_POOL_MAX=10` (keep small behind the pooler)
9. **Web project (`easyerp-web`) — set:** `API_INTERNAL_URL` = API project URL,
   e.g. `https://easyerp-api-<org>.vercel.app`. This is baked into the web
   build (rewrite target), so **set it, then redeploy/rebuild web** after any
   API URL change. `NODE_ENV=production` is automatic on Vercel.

### D. GitHub Secrets (only needed for the automated `deploy-demo.yml` route)

10. **Add 8 secrets** (repo Settings → Secrets → Actions): `VERCEL_TOKEN`,
    `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_API`, `VERCEL_PROJECT_ID_WEB`,
    `NEON_API_KEY`, `NEON_PROJECT_ID`, `DEMO_FIRST_SETUP_TOKEN`
    (`openssl rand -base64 32`), `DEMO_BETTER_AUTH_SECRET`
    (`openssl rand -base64 48`). Table in `DEPLOY.md` is correct.
11. **Run migrations against the direct string before/with deploy:**
    `DATABASE_URL=<direct-string> pnpm --filter @easyerp/api prisma:migrate:deploy`
    (same command the workflow's `neon-db` job runs). Never `migrate dev` in
    deploy — it prompts and hangs.
12. **Trigger:** push to `master` or `gh workflow run deploy-demo.yml`.
    The workflow creates/uses the Neon `demo` branch, migrates, deploys API,
    then web, then smoke-tests. Its CLI deploy commands omit a path because
    each Vercel project already has its Root Directory set (`apps/api` or
    `apps/web`); passing that same directory again makes Vercel append it twice.

### E. First-run setup + verify

13. **Complete setup** (one time, creates Business + Administrator):
    visit `https://<web>/fr/setup`, enter `FIRST_SETUP_TOKEN`, fill Business
    (legal name, tax id, country, VAT regime, currency), create Administrator.
14. **Sign in** at `https://<web>/fr/sign-in`. API checks:
    `curl https://<api>/api/health` → `{"status":"ok"}`;
    `curl https://<api>/api/ready` → database `ok`.
15. **Redeploy rule of thumb:** API URL changed → update `API_INTERNAL_URL` on
    web + rebuild web; schema changed → `migrate deploy` with direct URL first.

## Resetting the demo database

The `demo` branch is **persistent on purpose**: the workflow reuses it and applies
migrations, so the Business you created survives every deploy
(`deploy-demo.yml`, "Demo branch is persistent — identical to prod: keep data across
deploys"). Resetting is therefore a deliberate act, and there are three ways to do
it, cheapest first.

**1. Reset the Neon branch to its parent (the schema goes too).** Console → project →
Branches → `demo` → *Reset from parent*. CLI equivalent — `--parent` is a flag with no
value, and `demo`'s parent is `main`, which has never been migrated:

```bash
neonctl branches reset demo --parent --project-id "$NEON_PROJECT_ID"
```

**A reset leaves an empty schema, not an empty database.** "Reset from parent" means
"replace this branch's data *and schema* with the parent's", and `main` holds nothing,
so `document`, `number_series` and the other 36 tables are gone until migrations run
again. That is routine rather than a problem: the migrations are in git under
`apps/api/prisma/migrations/`, and regenerating the whole schema from an empty database
is one command against the **unpooled** connection string:

```bash
DATABASE_URL="$(neonctl connection-string --project-id "$NEON_PROJECT_ID" --branch demo --role neondb_owner)" \
  pnpm --filter @easyerp/api prisma:migrate:deploy
```

That is exactly what `deploy-demo.yml`'s `neon-db` job runs on every deploy, so the
easier route is to push anything or run `gh workflow run deploy-demo.yml` and let it
migrate. Either way the branch keeps its connection string — the API's
`DATABASE_URL` does not change — and the API answers `/api/ready` with a database error
until migrations are back, while the web app redirects to `/setup` because
`getStatus()` reports `needsSetup` rather than failing. Use the unpooled string for
migrations: the pooled one is a transaction pooler, and a migration that takes an
advisory lock through it can block instead of failing loudly.

**2. Delete the branch and let the workflow recreate it.** This is route 1 with a
different mechanism — the branch, its schema and its data all go — and the `neon-db` job
creates `demo` and migrates it when it is missing: The `neon-db` job creates
`demo` when it is missing, then migrates it:

```bash
neonctl branches delete demo --project-id "$NEON_PROJECT_ID"
gh workflow run deploy-demo.yml
```

**3. Empty the rows, keep the schema.** This is the one that leaves the schema intact,
so nothing has to be regenerated: Paste into the Neon SQL editor, or run against
the **unpooled** connection string. The order is dependency order — children before
parents — and the `TRUNCATE … CASCADE` is required because Issued documents refuse
`DELETE` in a trigger:

```sql
TRUNCATE TABLE reservation, stock_ledger_entry, delivery_note_line, delivery_note,
               document_tax_group, document_line, document RESTART IDENTITY CASCADE;
DELETE FROM payment_allocation; DELETE FROM payment;
DELETE FROM bom_version_line;  DELETE FROM bom_version;  DELETE FROM bom;
DELETE FROM user_role; DELETE FROM auth_session; DELETE FROM auth_account; DELETE FROM auth_user;
DELETE FROM auth_verification;
DELETE FROM role; DELETE FROM audit_entry; DELETE FROM module_state;
DELETE FROM business;
DELETE FROM item; DELETE FROM party; DELETE FROM custom_record; DELETE FROM field_definition;
DELETE FROM number_pattern; DELETE FROM number_series; DELETE FROM tax_rate;
DELETE FROM label; DELETE FROM unit;
```

`apps/api/src/identity/__tests__/harness.ts` (`resetDatabase`) is the authority for
this list; it is the same order the integration suite uses, so a new table added
without adding it here shows up as a failing test rather than a half-empty demo.
After any of the three, the first-run setup token is still valid and `/setup` is
reachable again — creating the Business is the next visit.

**A reset makes the next invoice number 0001 again.** Document numbers do not come
from a Postgres sequence — they come from `number_series.nextValue`
(`FA-{year}-{seq}`), and route 3 deletes that row, so the counter starts over. That is
correct for a demo being re-run from scratch and wrong for a live Business, which is
the whole reason this is a documented, deliberate act rather than something a deploy
does on its own. `RESTART IDENTITY` in the statement above only affects the surrogate
`id` sequences; it can be dropped without changing the document numbering either way.

## Keeping the demo's data, and moving it to a client's VPS

Resetting is fine while the demo is ours to break. The moment a client is looking at it,
the data stops being disposable: the Business, its Parties, its Items and its
`number_series` are what a migration to the VPS carries over, and a reset reuses numbers
that a customer may already be holding on paper.

**Why a redeploy cannot lose any of it.** Nothing in the deploy path writes downwards.
`deploy-demo.yml`'s `neon-db` job only creates a branch *if it is missing* and then runs
`prisma migrate deploy`, which applies committed migrations and never drops a table or a
row; there is no seed file in the repository, no `prisma migrate reset` and no
`prisma db push` in any script, and the integration harness refuses any database whose
name does not end in `_test`. `ops/src/deploy.ts` on the VPS backs the database up with
`pg_dump` *before* it migrates. Vercel and a code change touch the application, not the
database.

**Before the client sees it, take a dump and keep it off Neon.** Neon's free plan keeps a
six-hour history window, so an hour spent resetting is recoverable and last week is not.

```bash
# The unpooled string: `pg_dump` needs a direct connection (ADR 0013).
UNPOOLED="$(neonctl connection-string --project-id "$NEON_PROJECT_ID" --branch demo --role neondb_owner)"
pg_dump "$UNPOOLED" -Fc --no-owner --no-privileges -f easyerp-demo-$(date +%F).dump
```

Custom format (`-Fc`) is what `pg_restore` reads directly, and it is the same shape
`ops/src/backup.sh` writes on the VPS — so the file is one the existing restore drill can
already prove. Do not commit it: a dump of a customer's database belongs on the machine
that will own it.

**Then stop resetting.** From that point the demo is a copy of a client's data, and route
3 of the reset recipe is the only one that leaves a database worth keeping. Route 1 and
route 2 both delete rows a customer created. If the demo is to stay up while the client
types, `neonctl branches set-expiration demo` (no value) is worth running once, so a
branch that looks abandoned is not auto-archived out from under a live evaluation.

**Moving it to the VPS is one restore, not a re-entry.**

```bash
# On the VPS, after `pnpm ops:deploy` has created the database and the units.
scp easyerp-demo-2026-10-20.dump easyerp@<host>:/home/easyerp/
ssh easyerp@<host> 'pg_restore -U easyerp -d easyerp --no-owner --no-privileges \
  /home/easyerp/easyerp-demo-2026-10-20.dump'
ssh easyerp@<host> 'cd /home/easyerp/easyerp && git checkout release/<domain> && \
  DATABASE_URL=postgresql:///easyerp pnpm --filter @easyerp/api prisma:migrate:deploy'
```

Three things make this safe rather than hopeful:

- The dump carries `_prisma_migrations`, so Prisma reads the schema version off the
  restored rows instead of assuming one; the `migrate deploy` above is a no-op when the
  two are level, and applies only what the VPS is behind on.
- The dump carries `number_series`, so the next invoice on the VPS continues the
  sequence instead of restarting it — `FA-2026-0018` follows `FA-2026-0017`. This is the
  one thing a re-typed demo could not reproduce.
- `--no-owner --no-privileges` drops Neon's role names, which do not exist on the VPS.

Afterwards, check the counts rather than the deploy log — `SELECT count(*) FROM document;`
on both sides, and `SELECT code, year, "nextValue" FROM number_series;` — and print one
invoice that already exists, to confirm the paper still carries the row's figures.

## Stale / missing in repo docs (flags)

1. **Path is `DEPLOY.md` (repo root), not `docs/DEPLOY.md`.** This task's brief
   and any link saying `docs/DEPLOY.md` are stale.
2. **Printing needs nothing here any more.** Every document's paper is rendered
   from the stored row on request and printed by the visitor's browser, so the
   demo has no renderer, no archive directory and no blob store to configure.
   What this replaced is worth knowing before anyone re-adds it: the API used to
   render a PDF at issue through Chromium and file it on disk, which a serverless
   function cannot do — no browser binary, and a `/tmp` that is emptied between
   invocations — so printing was impossible here and every paper answered
   `ARCHIVE_UNAVAILABLE`. The fix was not to bundle a browser (261MB against a
   250MB limit, and no shared libraries to launch it) but to delete the archive
   and render from the row (ADR 0010).
3. **Do not set a custom `runtime` for the API function.** Vercel manages the
   Node.js runtime; a value such as `nodejs22` is invalid because `runtime`
   expects a custom runtime identifier in `package@version` form. Vercel
   discovers functions under `api/`, so `api/index.mjs` dynamically imports the
   compiled `dist/main.serverless.js`; rewrites send `/api/*` to that function.
4. **Workflow order bug: env vars are set AFTER deploy.** The `vercel-env` job
   (`vercel env add …`) runs after both deploys, so the just-deployed
   production deployment has no `DATABASE_URL`/`BETTER_AUTH_SECRET`/etc. at
   boot. Set the Vercel env vars manually (step 8) before the first deploy, or
   move env configuration before the deploy jobs.
5. **Workflow `deploy-web` reads `${{ env.api_url }}` across jobs** — but
   `deploy-api` only writes it to `$GITHUB_ENV` (job-scoped), never to a job
   `output`, so the web build's `API_INTERNAL_URL` is empty. Prefer manual step
   9 or fix with a real job output.
6. **`vercel env add … <<< "value"` syntax is wrong** — `vercel env add` is
   interactive; non-interactive usage is
   `printf '%s' "$VALUE" | vercel env add NAME production --project …`
   (and it fails if the var already exists — needs `vercel env rm -y` first).
7. **Workflow `neon-db` job never installs Node/pnpm** (no `pnpm/action-setup`
   + `setup-node` + `pnpm install`) yet runs `pnpm --filter … prisma:migrate:deploy`
   — fails on a stock runner. The `deploy-api`/`deploy-web` jobs do this correctly.
8. **Neon role `easyerp` creation is undocumented** (step 2 above); the
   workflow assumes it exists.
9. **Demo smoke-test payload shape is unverified** — `deploy-demo.yml`'s setup
   POST body (`business`/`administrator`/`units`/`taxRates`) is not confirmed
   against `packages/contracts` setup schema; re-check before trusting green.
10. **Untested-on-Vercel caveat still open** (session logs 2026-10-03/04):
    whether Better Auth's raw `auth.nodeHandler` survives the NestJS serverless
    wrapper long-term is the known risk; the smoke test's sign-in step is the
    canary — watch it.
