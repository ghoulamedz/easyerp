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

### Trigger Deploy
Push to `master` branch, or run workflow manually:
```bash
gh workflow run deploy-demo.yml
```

### Demo URLs (after deploy)
- **Web App**: `https://easyerp-web-<org>.vercel.app`
- **API**: `https://easyerp-api-<org>.vercel.app`
- **Setup Token**: Value of `DEMO_FIRST_SETUP_TOKEN` secret

### Demo Credentials (created by smoke test)
- **Email**: admin@demo.easyerp.tn
- **Password**: demo-password-123

---

## 🏭 Production Deployment (VPS)

### Target VPS Specs
- Ubuntu 24.04 LTS
- 2 vCPU, 4 GB RAM minimum
- 50 GB SSD
- Public IPv4

### One-Time VPS Setup

```bash
# 1. Install base packages
sudo apt-get update && sudo apt-get install -y \
  postgresql-17 caddy git curl

# 2. Create easyerp user & database
sudo -u postgres createuser -s easyerp
sudo -u postgres createdb -O easyerp easyerp
sudo useradd -m -s /bin/bash easyerp
sudo usermod -aG sudo easyerp

# 3. Setup SSH for GitHub Actions
# Generate ed25519 key, add public to /home/easyerp/.ssh/authorized_keys
# Add private key to GitHub Secrets as VPS_SSH_KEY

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

### GitHub Secrets for Production

| Secret | Value |
|--------|-------|
| `VPS_HOST` | VPS public IP |
| `VPS_USER` | `easyerp` |
| `VPS_SSH_KEY` | Private SSH key (from step 3) |
| `PROD_DATABASE_URL` | `postgresql://easyerp@localhost/easyerp?schema=public` |
| `PROD_BETTER_AUTH_SECRET` | `openssl rand -base64 48` |
| `PROD_BETTER_AUTH_URL` | `https://client-domain.tn` |
| `PROD_CORS_ORIGINS` | `https://client-domain.tn` |
| `PROD_FIRST_SETUP_TOKEN` | `openssl rand -base64 32` |
| `PROD_ACME_EMAIL` | `admin@client-domain.tn` |

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
| `DOCUMENT_ARCHIVE_ROOT` | `var/documents` | ✅ | Absolute path in prod |
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

# Setup flow
curl -X POST https://<api>.vercel.app/api/setup/complete \
  -H "Content-Type: application/json" \
  -d '{...}'

# Sign in
curl -X POST https://<api>.vercel.app/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.easyerp.tn","password":"demo-password-123"}'
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