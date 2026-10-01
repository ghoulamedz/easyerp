/**
 * Liveness and readiness.
 *
 * `/health` answers as long as the process is running: it is what a container
 * restart policy polls. `/ready` answers only once the database does, so a
 * rollout waits for migrations instead of routing traffic to a process whose
 * schema is behind.
 */

import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { type Health, healthSchema } from '@easyerp/contracts';
import { Public } from '../identity/authorization.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('health')
  @HttpCode(HttpStatus.OK)
  health(): Health {
    return { status: 'ok', checks: {} };
  }

  @Public()
  @Get('ready')
  async ready(): Promise<Health> {
    try {
      await this.prisma.ping();
      return { status: 'ok', checks: { database: 'ok' } };
    } catch (error) {
      // The reason goes to the log, never to the response. This endpoint is
      // public by necessity, so a load balancer, an aggregator and any browser
      // can read it, and a driver's error text carries hostnames and sometimes
      // credentials. The useful signal for a caller is "not ready", not why.
      const reason = error instanceof Error ? error.message : 'unknown';
      process.stderr.write(`[ready] database is not answering: ${reason}\n`);

      throw new ServiceUnavailableException({
        status: 'degraded',
        checks: { database: 'failing' },
      });
    }
  }
}

export { healthSchema };
