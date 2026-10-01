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
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** One round trip that proves the database answers, for `/ready`. */
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
}
