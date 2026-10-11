/**
 * VPS Production Deployment Script
 *
 * Run on the target VPS after pushing a release branch.
 * This is the one-time setup + the repeatable deploy command.
 *
 * Usage:
 *   pnpm --filter @easyerp/ops deploy <domain> [--skip-migrate]
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
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  CORS_ORIGINS: string;
  FIRST_SETUP_TOKEN: string;
  ACME_EMAIL: string | undefined;
}

/** Minimal env loader for the deploy script — reads from .env file on the VPS. */
function loadDeployEnv(): Env {
  const envPath = resolve(__dirname, '..', '.env');
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
    DATABASE_URL: env.DATABASE_URL!,
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET!,
    BETTER_AUTH_URL: env.BETTER_AUTH_URL!,
    CORS_ORIGINS: env.CORS_ORIGINS!,
    FIRST_SETUP_TOKEN: env.FIRST_SETUP_TOKEN!,
    ACME_EMAIL: env.ACME_EMAIL,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    // eslint-disable-next-line no-console
    console.error('Usage: deploy.ts <domain> [--skip-migrate]');
    process.exit(1);
  }

  const domain = args[0];
  const skipMigrate = args.includes('--skip-migrate');

  // eslint-disable-next-line no-console
  console.log(`🚀 Deploying to ${domain}...`);

  // Load production environment from .env on VPS
  const env = loadDeployEnv();

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
  await $`/home/easyerp/ops/src/backup.sh`;

  // 3. Pull latest code
  // eslint-disable-next-line no-console
  console.log('📥 Pulling latest code...');
  await $`cd ${repoDir} && git fetch && git checkout release/${domain} && git pull`;

  // 4. Install API deps
  // eslint-disable-next-line no-console
  console.log('📦 Installing API dependencies...');
  await $`cd ${apiDir} && pnpm install --prod --frozen-lockfile`;

  // 5. Install Web deps
  // eslint-disable-next-line no-console
  console.log('📦 Installing Web dependencies...');
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

  // 7. Generate Prisma client (in case schema changed)
  // eslint-disable-next-line no-console
  console.log('🔧 Generating Prisma client...');
  await $`cd ${apiDir} && pnpm prisma:generate`;

  // 8. Update Caddy config
  // eslint-disable-next-line no-console
  console.log('🌐 Updating Caddy config...');
  await $`sudo cp ${repoDir}/infra/caddy/Caddyfile /etc/caddy/Caddyfile`;
  await $`sudo sed -i "s/{$EASYERP_EMAIL_DOMAIN}/${domain}/" /etc/caddy/Caddyfile`;
  await $`sudo sed -i "s/{$ACME_EMAIL}/${env.ACME_EMAIL ?? `admin@${domain}`}/" /etc/caddy/Caddyfile`;

  // 9. Write environment files
  // eslint-disable-next-line no-console
  console.log('📝 Writing environment files...');
  await $`cat > ${apiDir}/.env << 'ENVEOF'
NODE_ENV=production
API_PORT=3002
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
API_INTERNAL_URL=http://127.0.0.1:3002
ENVEOF`;

  // 10. Restart services
  // eslint-disable-next-line no-console
  console.log('🔄 Restarting services...');
  await $`sudo systemctl daemon-reload`;
  await $`sudo systemctl restart easyerp-api easyerp-web caddy`;

  // 11. Health checks
  // eslint-disable-next-line no-console
  console.log('🏥 Running health checks...');
  await new Promise((r) => setTimeout(r, 5000));

  const apiHealth = String(await $`curl -sf http://127.0.0.1:3002/api/health`.catch(() => ''));
  if (!apiHealth.includes('ok')) throw new Error('API health check failed');

  const apiReady = String(await $`curl -sf http://127.0.0.1:3002/api/ready`.catch(() => ''));
  if (!apiReady.includes('ok')) throw new Error('API ready check failed');

  const webCheck = String(await $`curl -sf https://${domain}/fr/setup`.catch(() => ''));
  if (!webCheck.includes('Premier démarrage')) throw new Error('Web check failed');

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