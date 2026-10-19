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
   - `DOCUMENT_ARCHIVE_ROOT` = `/tmp/easyerp-documents` (**missing from
     `DEPLOY.md` and the workflow** — `env.ts` throws in production when this
     is left at the dev default `var/documents`; `/tmp` is the only writable
     dir on serverless, and files are ephemeral — demo only)
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

## Stale / missing in repo docs (flags)

1. **Path is `DEPLOY.md` (repo root), not `docs/DEPLOY.md`.** This task's brief
   and any link saying `docs/DEPLOY.md` are stale.
2. **`DOCUMENT_ARCHIVE_ROOT` missing from demo docs + workflow.** `env.ts`
   refuses production boot with the default; the workflow's `vercel-env` job
   never sets it → first automated deploy boots into a crash loop. Set
   `/tmp/easyerp-documents` (ephemeral — fine for demo, never for clients).
   Related: PDF archive on Vercel is ephemeral by nature (session log
   2026-10-05 open question) — issued PDFs won't survive cold starts/redeploys.

   **Print/download does not work on this deployment, and cannot.** Every
   paper (Customer Invoice, Credit Note, Sales Order, Delivery Note, Purchase
   Order, Goods Receipt, Production Order) is rendered by Chromium at issue
   time (`apps/api/src/finance/pdf.ts`) and filed on disk (ADR 0010). A
   serverless function has no Chromium and no persistent disk, so:

   - issuing still succeeds, and the render failure is logged, never fatal —
     a renderer outage must not strand a numbered document;
   - `GET <paper>/:id/pdf` answers the typed `ARCHIVE_UNAVAILABLE` (404) with
     an operator-facing message, precisely so the client no longer sees the
     old opaque `INTERNAL_ERROR`.

   Making print work here means removing the browser from the render path (a
   pure-JS PDF writer) or running the API in a container with Chromium and a
   mounted archive. Both are product decisions, not deployment flags.
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
