/**
 * The Prisma client, constructed through a driver adapter (Prisma 7 removed the
 * URL from the schema and from the constructor). There is exactly one
 * deployment per Business, so there is no tenant to select and no tenant_id in
 * any query (ADR 0003).
 */

import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/index.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      adapter: new PrismaPg({
        connectionString: env().DATABASE_URL,
        max: env().DATABASE_POOL_MAX,
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch (error) {
      // On Vercel a fresh deploy may have a bad DATABASE_URL or a cold pooler —
      // crashing here would take down every route including GET /api/health
      // (liveness) and GET /api/setup/status (which assumes a fresh DB).
      // Log and continue; /ready will report the failure and setup will assume
      // needsSetup:true so the web app can show the error on /setup.
      const msg = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[PrismaService] $connect failed — continuing without DB: ${msg}\n`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** One round trip that proves the database answers, for `/ready`. */
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
}
