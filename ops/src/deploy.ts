/**
 * VPS Production Deployment Script
 *
 * Run on the target VPS after pushing a release branch.
 * This is the one-time setup + the repeatable deploy command.
 *
 * Usage:
 *   SITE_DOMAIN=client-domain.tn pnpm --filter @easyerp/ops deploy [--skip-migrate]
 *   pnpm --filter @easyerp/ops deploy <domain> [--skip-migrate]
 *
 * Every placeholder value and secret comes from the host environment file
 * (see .env.example, Production/VPS section): SITE_DOMAIN, API_PORT,
 * WEB_PORT, ACME_EMAIL, DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL,
 * CORS_ORIGINS, FIRST_SETUP_TOKEN. The CLI domain argument is only a
 * fallback for SITE_DOMAIN.
 *
 * Prerequisites (run once per VPS):
 *   1. sudo apt-get update && sudo apt-get install -y postgresql-17 caddy nodejs npm
 *   2. sudo -u postgres createuser -s easyerp
 *   3. sudo -u postgres createdb -O easyerp easyerp
 *   4. sudo useradd -m -s /bin/bash easyerp
 *   5. sudo usermod -aG sudo easyerp
 *   6. Generate SSH key for GitHub Actions, add to authorized_keys
 *   7. Install nvm + Node 24 + pnpm 10 as easyerp user
 */

import { $ } from 'zx';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

$.verbose = false;

const __dirname = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface Env {
  SITE_DOMAIN: string | undefined;
  API_PORT: string | undefined;
  WEB_PORT: string | undefined;
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  CORS_ORIGINS: string;
  FIRST_SETUP_TOKEN: string;
  ACME_EMAIL: string | undefined;
}

/** Minimal env loader for the deploy script — reads from a .env file. */
function loadDeployEnv(envPath: string): Env {
  const content = readFileSync(envPath, 'utf8');
  const env: Record<string, string | undefined> = {};
  for (const line of content.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match && match[1] !== undefined) env[match[1]] = match[2];
  }
  const required: string[] = ['DATABASE_URL', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'CORS_ORIGINS', 'FIRST_SETUP_TOKEN'];
  for (const key of required) {
    if (!env[key]) throw new Error(`Missing required env var: ${key}`);
  }
  return {
    SITE_DOMAIN: env.SITE_DOMAIN,
    API_PORT: env.API_PORT,
    WEB_PORT: env.WEB_PORT,
    DATABASE_URL: env.DATABASE_URL!,
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET!,
    BETTER_AUTH_URL: env.BETTER_AUTH_URL!,
    CORS_ORIGINS: env.CORS_ORIGINS!,
    FIRST_SETUP_TOKEN: env.FIRST_SETUP_TOKEN!,
    ACME_EMAIL: env.ACME_EMAIL,
  };
}

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== '--skip-migrate');
  const skipMigrate = process.argv.includes('--skip-migrate');

  // The domain is a placeholder value like any other: it comes from the
  // environment first, and the CLI argument is only a fallback.
  const domain = process.env.SITE_DOMAIN ?? args[0];
  if (!domain) {
    // eslint-disable-next-line no-console
    console.error('Usage: SITE_DOMAIN=<domain> deploy [--skip-migrate] (or: deploy <domain> [--skip-migrate])');
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log(`🚀 Deploying to ${domain}...`);

  // Load production environment from .env next to the repo (see .env.example).
  const envPath = process.env.EASYERP_DEPLOY_ENV ?? resolve(__dirname, '..', '.env');
  const env = loadDeployEnv(envPath);
  const apiPort = process.env.API_PORT ?? env.API_PORT ?? '3002';
  const webPort = process.env.WEB_PORT ?? env.WEB_PORT ?? '3003';
  const acmeEmail = process.env.ACME_EMAIL ?? env.ACME_EMAIL ?? `admin@${domain}`;

  const apiDir = '/home/easyerp/easyerp-api';
  const webDir = '/home/easyerp/easyerp-web';
  const repoDir = '/home/easyerp/easyerp';

  // 1. Stop services gracefully
  // eslint-disable-next-line no-console
  console.log('🛑 Stopping services...');
  await $`sudo systemctl stop easyerp-api easyerp-web`;

  // 2. Backup database
  // eslint-disable-next-line no-console
  console.log('💾 Backing up database...');
  await $`/home/easyerp/easyerp/ops/src/backup.sh`;

  // 3. Pull latest code
  // eslint-disable-next-line no-console
  console.log('📥 Pulling latest code...');
  await $`cd ${repoDir} && git fetch && git checkout release/${domain} && git pull`;

  // 4. Build from the checked-out source. The units serve prebuilt output,
  // so the deploy ships compiled artifacts, not a bare git checkout: install
  // (frozen lockfile), generate, and build both halves here on the host.
  // eslint-disable-next-line no-console
  console.log('🔨 Building...');
  await $`cd ${repoDir} && pnpm install --frozen-lockfile`;
  await $`cd ${repoDir} && pnpm --filter @easyerp/api prisma:generate`;
  await $`cd ${repoDir} && pnpm --filter @easyerp/api build`;
  await $`cd ${repoDir} && pnpm --filter @easyerp/web build`;

  // 5. Sync the build output into the unit directories. The API unit runs
  // `dist/main.js` from its working directory, so the build output lands in
  // a dist/ subdirectory — syncing it flat would leave ExecStart pointing
  // at nothing. The lockfiles travel with package.json because install runs
  // with --frozen-lockfile on the host.
  // eslint-disable-next-line no-console
  console.log('📦 Shipping API artifacts...');
  await $`rsync -a --delete ${repoDir}/apps/api/dist/ ${apiDir}/dist/`;
  await $`rsync -a --delete ${repoDir}/apps/api/prisma/ ${apiDir}/prisma/`;
  await $`cp ${repoDir}/apps/api/package.json ${repoDir}/pnpm-lock.yaml ${repoDir}/pnpm-workspace.yaml ${apiDir}/`;
  await $`cd ${apiDir} && pnpm install --prod --frozen-lockfile`;

  // eslint-disable-next-line no-console
  console.log('📦 Shipping Web artifacts...');
  await $`rsync -a --delete ${repoDir}/apps/web/.next/ ${webDir}/.next/`;
  await $`rsync -a --delete ${repoDir}/apps/web/public/ ${webDir}/public/`;
  await $`cp ${repoDir}/apps/web/package.json ${repoDir}/apps/web/next.config.ts ${repoDir}/pnpm-lock.yaml ${repoDir}/pnpm-workspace.yaml ${webDir}/`;
  await $`cd ${webDir} && pnpm install --prod --frozen-lockfile`;

  // 6. Run database migrations
  if (!skipMigrate) {
    // eslint-disable-next-line no-console
    console.log('🗄️ Running database migrations...');
    await $`cd ${apiDir} && DATABASE_URL=${env.DATABASE_URL} pnpm prisma:migrate:deploy`;
  } else {
    // eslint-disable-next-line no-console
    console.log('⏭️ Skipping migrations');
  }

  // 7. Update Caddy config. Placeholders are bare {$VAR} (see the Caddyfile
  // header); the \$ keeps zx from expanding the placeholder name.
  // eslint-disable-next-line no-console
  console.log('🌐 Updating Caddy config...');
  await $`sudo cp ${repoDir}/infra/caddy/Caddyfile /etc/caddy/Caddyfile`;
  await $`sudo sed -i "s/{\\$SITE_DOMAIN}/${domain}/" /etc/caddy/Caddyfile`;
  await $`sudo sed -i "s/{\\$ACME_EMAIL}/${acmeEmail}/" /etc/caddy/Caddyfile`;
  await $`sudo sed -i "s/{\\$API_PORT}/${apiPort}/" /etc/caddy/Caddyfile`;
  await $`sudo sed -i "s/{\\$WEB_PORT}/${webPort}/" /etc/caddy/Caddyfile`;

  // 8. Write environment files
  // eslint-disable-next-line no-console
  console.log('📝 Writing environment files...');
  await $`cat > ${apiDir}/.env << 'ENVEOF'
NODE_ENV=production
API_PORT=${apiPort}
API_HOST=0.0.0.0
LOG_LEVEL=info
DATABASE_URL=${env.DATABASE_URL}
DATABASE_POOL_MAX=10
DOCUMENT_ARCHIVE_ROOT=/var/lib/easyerp/documents
BETTER_AUTH_SECRET=${env.BETTER_AUTH_SECRET}
BETTER_AUTH_URL=https://${domain}
CORS_ORIGINS=https://${domain}
FIRST_SETUP_TOKEN=${env.FIRST_SETUP_TOKEN}
ENVEOF`;

  await $`cat > ${webDir}/.env << 'ENVEOF'
NODE_ENV=production
API_INTERNAL_URL=http://127.0.0.1:${apiPort}
ENVEOF`;

  // 9. Restart services
  // eslint-disable-next-line no-console
  console.log('🔄 Restarting services...');
  await $`sudo systemctl daemon-reload`;
  await $`sudo systemctl restart easyerp-api easyerp-web caddy`;

  // 10. Health checks. The API gates the deploy; the web page only has to
  // answer — on an already-initialized Business Setup is closed, so its copy
  // is never asserted here.
  // eslint-disable-next-line no-console
  console.log('🏥 Running health checks...');
  await new Promise((r) => setTimeout(r, 5000));

  const apiHealth = String(await $`curl -sf http://127.0.0.1:${apiPort}/api/health`.catch(() => ''));
  if (!apiHealth.includes('ok')) throw new Error('API health check failed');

  const apiReady = String(await $`curl -sf http://127.0.0.1:${apiPort}/api/ready`.catch(() => ''));
  if (!apiReady.includes('ok')) throw new Error('API ready check failed');

  const webCheck = String(await $`curl -sf https://${domain}/fr/setup -o /dev/null`.catch(() => 'FAIL'));
  if (webCheck.includes('FAIL')) throw new Error('Web check failed');

  // eslint-disable-next-line no-console
  console.log('✅ Deployment successful!');
  // eslint-disable-next-line no-console
  console.log(`   Web: https://${domain}`);
  // eslint-disable-next-line no-console
  console.log(`   API: https://${domain}/api`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('❌ Deployment failed:', err);
  process.exit(1);
});
