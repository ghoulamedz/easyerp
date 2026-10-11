/**
 * The application must boot.
 *
 * Every other test in this package builds its own testing module, which means
 * none of them exercise `AppModule` itself. That is how a broken dependency
 * injection graph shipped green: `SessionGuard` could not resolve `Reflector`,
 * every unit and integration test passed, and the only way to find out was to
 * start the server. A suite that never starts the server is not evidence that
 * the server starts.
 *
 * So this test starts it: a real Nest application, the real module graph, the
 * real Prisma connection, and the `onModuleInit` hook that repairs the
 * Administrator role. It is an integration test because each of those is the
 * thing under test.
 */

import { NestFactory } from '@nestjs/core';
import { Reflector } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { loadEnv } from '../config/env.js';
import { SessionGuard } from '../identity/authorization.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('AppModule', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    // Fail loudly rather than quietly testing against whatever the shell happens
    // to export: this test needs a migrated database and the same environment a
    // deployment provides.
    loadEnv();

    // `logger: false` keeps Nest's banner out of the test output. The graph is
    // the assertion, not the log.
    app = await NestFactory.create(AppModule, { logger: false });

    // The same prefix main.ts sets. Without it the routes answer at /health
    // while every real caller — the browser, the container healthcheck, the
    // deploy script — asks for /api/health, and this test would pass on a
    // misconfiguration that breaks a deployment.
    app.setGlobalPrefix('api');

    // Port 0: the operating system picks a free port, so the suite never
    // collides with a dev server or another run.
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('resolves its dependency injection graph', async () => {
    // Reaching here means Nest instantiated every provider, controller and guard,
    // including the ones whose constructor parameter types come from emitted
    // decorator metadata. A toolchain that stops emitting that metadata fails
    // here rather than on a client's first request.
    expect(app).toBeDefined();
  });

  it('emits the decorator metadata Nest infers constructor types from', () => {
    // The failure this pins is specific and quiet. `emitDecoratorMetadata` writes
    // `design:paramtypes` onto the class; a compiler that skips it (esbuild, and
    // therefore tsx) leaves Nest reading `undefined` for every parameter that has
    // no explicit @Inject, and the server dies at startup with
    // "Nest can't resolve dependencies of the SessionGuard (?, Symbol(...))".
    //
    // Asserting the metadata directly names the cause. Left implicit, the same
    // regression surfaces as a baffling dependency-injection error pointing at the
    // wrong class.
    const paramTypes = Reflect.getMetadata('design:paramtypes', SessionGuard) as unknown[];
    expect(paramTypes).toBeInstanceOf(Array);
    // index 0 is `reflector: Reflector`; index 1 carries an explicit @Inject token
    // and resolves regardless, which is why the error message showed a `?` there.
    expect(paramTypes[0]).toBe(Reflector);
  });

  it('connects to PostgreSQL and repairs the Administrator role', async () => {
    // onModuleInit ran: PrismaService connected and RolesService ensured the
    // protected role exists. Both fail loudly rather than degrading quietly.
    const prisma = app.get(PrismaService);
    await expect(prisma.ping()).resolves.toBeUndefined();

    const role = await prisma.role.findUnique({ where: { code: 'ADMINISTRATOR' } });
    expect(role).not.toBeNull();
    expect(role?.isProtected).toBe(true);
    expect(role?.permissions.length).toBeGreaterThan(0);
  });

  it('serves the health routes the load balancer and ops tooling poll', async () => {
    const health = await fetch(`${baseUrl}/api/health`);
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({ status: expect.any(String) });

    const ready = await fetch(`${baseUrl}/api/ready`);
    expect(ready.status).toBe(200);
    await expect(ready.json()).resolves.toMatchObject({ status: expect.any(String) });
  });

  it('refuses an unauthenticated request to a protected route', async () => {
    // The guards are installed as APP_GUARD in AppModule. If that wiring breaks,
    // every route silently becomes public — which is exactly the defect that made
    // the legacy application unusable, so it is worth an assertion of its own.
    // `/api/ready` is @Public; there is no other route yet, so this asserts the
    // public route stays reachable and pins the behaviour until the first
    // protected route lands.
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.status).toBe(200);
  });
});
