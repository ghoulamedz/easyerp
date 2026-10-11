/**
 * Prisma CLI configuration (Prisma 7 moved the connection string here, out of
 * schema.prisma). The URL is read from the environment directly rather than
 * through `env()`, because `prisma generate` runs in CI and in `pnpm build`
 * where no database exists yet, and `env()` throws on a missing variable.
 */

import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
    /**
     * Only `prisma migrate diff --from-migrations` reads this, which is a local
     * authoring step for writing a migration. It is deliberately not defaulted:
     * a deployment and `prisma generate` never diff a migrations directory, and a
     * shadow URL invented here would point them at a database that does not exist.
     */
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
