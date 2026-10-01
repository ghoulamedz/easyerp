/**
 * The health endpoints, tested against the shapes the interface and the
 * infrastructure depend on.
 *
 * The path matters as much as the body. These routes are served under the
 * `/api` prefix that `main.ts` sets, so a unit test on the controller alone
 * cannot catch a prefix that was never applied — which is exactly the bug that
 * made every caller 404 while the controller itself stayed perfectly correct.
 */

import { describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import type { PrismaService } from '../prisma/prisma.service.js';

function controller(ping: () => Promise<void>): HealthController {
  const prisma = { ping } as unknown as PrismaService;
  return new HealthController(prisma);
}

describe('health', () => {
  it('answers ok without touching the database', async () => {
    // Liveness must stay answerable while the database is down: otherwise a
    // database outage becomes a restart loop that outlives the outage.
    const ping = vi.fn(async () => {
      throw new Error('must not be called');
    });
    const result = controller(ping).health();

    expect(result).toEqual({ status: 'ok', checks: {} });
    expect(ping).not.toHaveBeenCalled();
  });
});

describe('ready', () => {
  it('answers ok once the database answers', async () => {
    const result = await controller(async () => {}).ready();
    expect(result).toEqual({ status: 'ok', checks: { database: 'ok' } });
  });

  it('reports 503 rather than ok when the database does not answer', async () => {
    // "Reachable" and "usable" are different claims, and a rollout that believes
    // the second when only the first is true sends traffic into a broken process.
    const controller_ = controller(async () => {
      throw new Error('connection refused');
    });

    await expect(controller_.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('never leaks the database error text into the status body', async () => {
    const controller_ = controller(async () => {
      throw new Error('password authentication failed for user "easyerp"');
    });

    const failure = await controller_.ready().catch((error: unknown) => error);
    const body = JSON.stringify((failure as ServiceUnavailableException).getResponse());

    // Credentials in an error string must not reach a public endpoint that any
    // load balancer, log aggregator and browser can read.
    expect(body).not.toContain('password');
    expect(body).toContain('degraded');
  });

  it('survives a rejection that is not an Error', async () => {
    const controller_ = controller(async () => {
      throw 'a bare string';
    });
    await expect(controller_.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
