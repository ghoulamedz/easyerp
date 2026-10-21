# easyERP Deployment Guide

Two deployment paths exist:

| Path | Use Case | Cost | Infra |
|------|----------|------|-------|
| **Demo (Vercel + Neon)** | Client demos, evaluation | Free tier | Serverless |
| **Production (VPS)** | Real Business deployments | ~$5-20/mo | Native |

---

## 🎯 Demo Deployment (Vercel + Neon)

### One-Time Setup

#### 1. Create Neon Project
```bash
# At console.neon.tech
# 1. Create project "easyerp-demo"
# 2. Note the Project ID
# 3. Create API Key (Account → API Keys)
```

#### 2. Create Vercel Projects
```bash
# At vercel.com
# 1. Import easyerp repo → Project: "easyerp-api"
#    - Framework: Other
    - Root Directory: apps/api
    - Build Command: pnpm --filter @easyerp/api build
    - Output Directory: dist
# 2. Import again → Project: "easyerp-web"
#    - Framework: Next.js
#    - Root Directory: apps/web
```

#### 3. Add GitHub Secrets (Settings → Secrets → Actions)

| Secret | Source |
|--------|--------|
| `VERCEL_TOKEN` | vercel.com/account/tokens |
| `VERCEL_ORG_ID` | Vercel org settings |
| `VERCEL_PROJECT_ID_API` | API project settings |
| `VERCEL_PROJECT_ID_WEB` | Web project settings |
| `NEON_API_KEY` | Neon API Keys page |
| `NEON_PROJECT_ID` | Neon project dashboard |
| `DEMO_FIRST_SETUP_TOKEN` | `openssl rand -base64 32` |
| `DEMO_BETTER_AUTH_SECRET` | `openssl rand -base64 48` |

Names match the Demo section of `.env.example`, which documents each value
and the command that generates it.

### Trigger Deploy

**Manual only — a push does not deploy anything.** Both deploy workflows are
`workflow_dispatch`-only, so a release is a decision rather than a side effect of merging.

```bash
# Demo (Vercel + Neon)
gh workflow run deploy-demo.yml --ref master

# A client's VPS
gh workflow run deploy-vps.yml -f domain=client.example.tn

# Watch it
gh run watch "$(gh run list --workflow=deploy-demo.yml --limit=1 \
  --json databaseId --jq '.[0].databaseId')"
```

`ci.yml` still runs on every push and pull request. It deploys nothing; it is the
quality gate (lint, typecheck, unit, integration, e2e).

### A deploy does NOT wipe the demo database
The `demo` branch is persistent, and the workflow creates it only if it is missing and
then runs `prisma migrate deploy` — which applies committed migrations and never drops a
table or a row. The Business, its Parties, its Items and its `number_series` survive
every deploy. There is no seed file, and no `migrate reset` or `db push` anywhere in a
script.

`/fr/setup` is therefore **closed** after the first Setup, and the smoke test signs in as
the existing account rather than creating one.

### Demo URLs (after deploy)
- **Web App**: `https://easyerp-web-<org>.vercel.app`
- **API**: `https://easyerp-api-<org>.vercel.app`
- **Setup Token**: Value of `DEMO_FIRST_SETUP_TOKEN` secret

### First Setup (no demo credentials)
There are no long-lived demo credentials. After each deploy:
1. Visit `https://easyerp-web-<org>.vercel.app/fr/setup`.
2. Enter the `DEMO_FIRST_SETUP_TOKEN` value.
3. Fill in Business details and create your Administrator.
4. Sign in at `/fr/sign-in` with the account you just created.

### Redeploy
```bash
gh workflow run deploy-demo.yml --ref master
```

### Updating the live app without losing data

**What is safe by construction.** Nothing in the deploy path writes downwards. The
application and the database deploy independently: Vercel replaces the functions and the
database is untouched, so a bad release is reverted by redeploying the previous commit
and the data never moved.

**The order, which the workflow already follows.** Migrate → deploy → smoke test.
Between the migration and the new code, the *old* code runs against the *new* schema. An
additive migration — an added nullable column, a new table, a new index — is invisible to
it. That is the whole reason for the additive-only rule in `AGENTS.md`: it is what makes
the upgrade window empty rather than merely short.

**Before a release you are unsure about, take a dump.** Neon's free plan keeps six hours
of history; a dump is the only thing older than that.

```bash
UNPOOLED="$(neonctl connection-string --project-id "$NEON_PROJECT_ID" --branch demo --role neondb_owner)"
pg_dump "$UNPOOLED" -Fc --no-owner --no-privileges -f before-$(date +%F-%H%M).dump
```

**If a release goes wrong, revert the code — not the database.**
1. `git revert` the commit and run the workflow again, or promote the previous Vercel
   deployment. Immediate, and it touches no data.
2. Only if a *migration* was wrong, `pg_restore` the dump taken **before** the run.
3. Never restore a dump taken after a bad migration over one taken before it — that
   re-applies the damage.

**Do not use Neon's *Reset from parent*.** It restores `main`, which has never been
migrated, so it takes the schema as well as the rows. It was the right tool while the
demo was disposable; a client is using it as production now.

The longer version, with the three reset routes and the VPS migration, is in
`docs/deploy-vercel-neon-free.md`.

---

## 🏭 Production Deployment (VPS)

### Target VPS Specs
- Ubuntu 24.04 LTS
- 2 vCPU, 4 GB RAM minimum
- 50 GB SSD
- Public IPv4

### One-Time VPS Setup

```bash
# 1. Install base packages.
#    `postgresql` resolves to 16 on Ubuntu 24.04, which is the version ADR 0013
#    asks for: the distribution's own build, one major behind on purpose.
#    `postgresql-17` is not in Ubuntu's archive and apt would refuse it.
sudo apt-get update && sudo apt-get install -y \
  postgresql caddy git curl

# 2. Create easyerp user & database
sudo -u postgres createuser -s easyerp
sudo -u postgres createdb -O easyerp easyerp
sudo useradd -m -s /bin/bash easyerp
sudo usermod -aG sudo easyerp

# 3. Setup SSH for GitHub Actions
# Generate ed25519 key, add public to /home/easyerp/.ssh/authorized_keys
# Add private key to GitHub Secrets as VPS_SSH_KEY
# Record the host key so the workflow can pin it (VPS_KNOWN_HOSTS secret):
# ssh-keyscan -t ed25519 <vps-ip-or-hostname>

# 4. Install Node.js 24 + pnpm 10 as easyerp user
sudo -u easyerp bash -c 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash'
sudo -u easyerp bash -c 'source ~/.nvm/nvm.sh && nvm install 24 && nvm alias default 24 && corepack enable && corepack prepare pnpm@10 --activate'

# 5. Install systemd services
sudo cp /home/easyerp/easyerp/ops/systemd/easyerp-api.service /etc/systemd/system/
sudo cp /home/easyerp/easyerp/ops/systemd/easyerp-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable easyerp-api easyerp-web caddy

# 6. Setup backup cron (runs daily at 03:00)
sudo -u easyerp crontab -e
# 0 3 * * * /home/easyerp/easyerp/ops/src/backup.sh

# 7. Setup monthly restore drill cron
# 0 4 1 * * /home/easyerp/easyerp/ops/src/restore-drill.sh
```

### Backups and restore drills

Backups are uncompressed custom-format (`pg_dump -Fc`) dumps under one root:
`/home/easyerp/backups/`, with `daily/` (7 kept), `weekly/` (4 kept) and
`monthly/` (12 kept) rotation. `pg_restore` reads the dump file directly —
there is no gzip layer, so the drill restores exactly the file the backup
wrote. The monthly drill restores the latest daily dump into a throwaway
`easyerp_restore_test_*` database (dropped by a trap even on failure) and
checks the `business` table came back. The deploy itself is gated on
`/api/health` plus `/api/ready`; the web page is only required to answer —
Setup copy is never asserted, because on an already-initialized Business
Setup is closed.

### GitHub Secrets for Production

| Secret | Value |
|--------|-------|
| `VPS_HOST` | VPS public IP |
| `VPS_USER` | `easyerp` |
| `VPS_SSH_KEY` | Private SSH key (from step 3) |
| `VPS_KNOWN_HOSTS` | `ssh-keyscan -t ed25519 <vps-ip>` output (from step 3) |
| `PROD_DATABASE_URL` | `postgresql://easyerp@localhost/easyerp?schema=public` |
| `PROD_BETTER_AUTH_SECRET` | `openssl rand -base64 48` |
| `PROD_FIRST_SETUP_TOKEN` | `openssl rand -base64 32` |
| `PROD_ACME_EMAIL` | `admin@client-domain.tn` |

Names match the Production/VPS section of `.env.example`, which documents
each value and the command that generates it. Secrets are referenced, never
printed: the workflow masks connection strings after capture and the summary
steps redact tokens.

`PROD_BETTER_AUTH_URL` and `PROD_CORS_ORIGINS` are **not** in this list on
purpose: the deploy renders both from the domain it is deploying to
(`https://$DOMAIN`, from the `release/<domain>` branch name or the
`workflow_dispatch` input). A secret here would be a value that looks
authoritative and changes nothing — the same trap that once left a deployment
trusting a placeholder origin while sign-in answered 403 for every visitor.

### Deploy to Production

```bash
# Create release branch
git checkout -b release/client-domain.tn
git push -u origin release/client-domain.tn

# GitHub Actions triggers deploy-vps.yml
# Or manually:
gh workflow run deploy-vps.yml -f domain=client-domain.tn
```

### Post-Deploy
1. Visit `https://client-domain.tn/fr/setup`
2. Enter `FIRST_SETUP_TOKEN` from server env
3. Fill in Business details, create Administrator
4. Sign in at `https://client-domain.tn/fr/sign-in`

---

## 🔄 Database Migrations

### Local / CI
```bash
pnpm db:generate        # Regenerate Prisma client
pnpm db:migrate:all     # Apply all migrations to both DBs
```

### Neon (Demo)
Migrations run automatically in `deploy-demo.yml` via `prisma:migrate:deploy` against the unpooled connection string.

### VPS (Production)
Migrations run automatically in `deploy-vps.yml` and `deploy.ts` before service restart.

---

## 🔐 Environment Variables Reference

### API (Required)
| Variable | Dev Default | Prod Required | Notes |
|----------|-------------|---------------|-------|
| `DATABASE_URL` | `postgresql://...:55432/...` | ✅ | Pooled for Neon |
| `DATABASE_URL_UNPOOLED` | - | Neon only | For migrations |
| `BETTER_AUTH_SECRET` | `dev-only-...` | ✅ | 32+ chars, `openssl rand -base64 48` |
| `BETTER_AUTH_URL` | `http://localhost:3003` | ✅ | Web app URL |
| `CORS_ORIGINS` | `http://localhost:3003` | ✅ | Comma-separated, no wildcards |
| `FIRST_SETUP_TOKEN` | `dev-first-setup-token` | ✅ | `openssl rand -base64 32` |
| `API_PORT` | `3002` | ✅ | |
| `API_HOST` | `0.0.0.0` | ✅ | |
| `LOG_LEVEL` | `info` | | |
| `NODE_ENV` | `development` | ✅ | `production` |

### Web (Optional)
| Variable | Purpose |
|----------|---------|
| `API_INTERNAL_URL` | Proxy target for `/api/*` (default: `http://localhost:3002`) |
| `NODE_ENV` | `production` for production build |

---

## 🧪 Verification Commands

### Demo
```bash
# Health
curl https://<api>.vercel.app/api/health
curl https://<api>.vercel.app/api/ready

# Setup flow (fresh deploy: /fr/setup is open, run this or use the web form)
curl -X POST https://<api>.vercel.app/api/setup/complete \
  -H "Content-Type: application/json" \
  -d '{...}'

# Sign in (use the Administrator you created via Setup —
# no credentials survive a redeploy)
curl -X POST https://<api>.vercel.app/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"<your-admin-email>","password":"<your-admin-password>"}'
```

### Production
```bash
# Health (via Caddy)
curl https://client-domain.tn/api/health
curl https://client-domain.tn/api/ready

# Web
curl https://client-domain.tn/fr/setup
```

---

## 📋 Checklist for New Business Deployment

- [ ] VPS provisioned with specs above
- [ ] PostgreSQL 17 installed, `easyerp` user/db created
- [ ] Caddy installed, DNS A record pointing to VPS
- [ ] SSH key added to GitHub Secrets
- [ ] Systemd services installed & enabled
- [ ] Backup cron configured
- [ ] GitHub Secrets configured for production
- [ ] Release branch created (`release/client-domain.tn`)
- [ ] Deploy workflow triggered
- [ ] Health checks pass
- [ ] First-run setup completed by client
- [ ] Administrator can sign in
- [ ] Backup restore drill scheduled

---

## 🆘 Troubleshooting

### API won't start
```bash
sudo journalctl -u easyerp-api -f
# Check .env exists and has all required vars
# Check DATABASE_URL connectivity
```

### Web shows 502
```bash
sudo journalctl -u easyerp-web -f
# Check API is running on 3002
curl http://127.0.0.1:3002/api/health
```

### Caddy TLS fails
```bash
sudo journalctl -u caddy -f
# Check DNS A record resolves to VPS IP
# Check port 80/443 open in firewall
```

### Migrations fail
```bash
cd /home/easyerp/easyerp-api
DATABASE_URL=... pnpm prisma:migrate:deploy
# Or manually: pnpm prisma migrate resolve --applied <migration_name>
```

---

## 📚 Related Docs
- `docs/adr/0013-two-deployment-targets.md` — Why two paths
- `docs/database-migrations.md` — Migration mechanics
- `AGENTS.md` — Local development workflow