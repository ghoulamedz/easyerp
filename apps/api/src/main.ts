/**
 * Process bootstrap.
 *
 * The middleware order here is load-bearing (ADR 0007): Better Auth's handler is
 * registered on the raw Express server *before* any body parser runs, because it
 * owns its own request parsing. Nest is created with `bodyParser: false` and the
 * parsers are added by hand afterwards, so the order is stated in one place
 * instead of depending on when Nest decides to install its own.
 */

import 'reflect-metadata';
import express from 'express';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { DomainExceptionFilter } from './common/domain-exception.filter.js';
import { loadEnv } from './config/env.js';
import { getAuth } from './identity/auth/better-auth.provider.js';
import { trustedOrigins } from './identity/auth/trusted-origins.js';
import { PrismaService } from './prisma/prisma.service.js';

/** A document body is small; anything larger is a bug or an attack. */
const BODY_LIMIT = '1mb';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const server = express();

  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    bodyParser: false,
    bufferLogs: true,
  });

  // 1. Security headers first, so even an auth failure is not a bare response.
  app.use(
    helmet({
      // The API serves JSON and PDFs, never HTML, so a restrictive policy costs
      // nothing and removes an entire class of injection surface.
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  // 2. Better Auth, before any body parser: it parses its own requests.
  const auth = await getAuth(app.get(PrismaService));
  server.use('/api/auth', auth.nodeHandler);

  // 3. Body parsing, for everything else.
  app.use(express.json({ limit: BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));

  // Exact origins only. A wildcard alongside credentials is an open door. The
  // list is the same one Better Auth trusts, built by the same function, so CORS
  // and the origin check cannot disagree about who may send a credentialed
  // request.
  app.enableCors({
    origin: trustedOrigins({
      corsOrigins: env.CORS_ORIGINS,
      vercelUrl: env.VERCEL_URL,
      vercelProjectProductionUrl: env.VERCEL_PROJECT_PRODUCTION_URL,
    }),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });
  app.useGlobalFilters(new DomainExceptionFilter());
  app.enableShutdownHooks();

  // Everything Nest serves lives under `/api`, so the API, Better Auth at
  // `/api/auth`, and the Caddy rule `handle /api/*` all address one path space.
  // Without this, health answered at `/health` while every caller — the browser,
  // the container healthcheck, the deploy script — asked for `/api/...`.
  app.setGlobalPrefix('api');

  await app.init();

  server.listen(env.API_PORT, env.API_HOST, () => {
    process.stdout.write(`easyERP api listening on ${env.API_HOST}:${env.API_PORT}\n`);
  });
}

bootstrap().catch((error: unknown) => {
  process.stderr.write(
    `easyERP api failed to start: ${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exitCode = 1;
});
