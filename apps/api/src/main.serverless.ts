/**
 * Vercel Serverless entry point for the API.
 *
 * The production VPS uses `main.ts` with native Node + systemd.
 * Vercel serverless functions need a different bootstrap:
 * - No persistent process, so no `onModuleInit` at startup
 * - Better Auth handler must be mounted before body parsing
 * - Each invocation is a cold start (or warm), so Prisma connection pooling is critical
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
import { PrismaService } from './prisma/prisma.service.js';

/** A document body is small; anything larger is a bug or an attack. */
const BODY_LIMIT = '1mb';

let cachedApp: ReturnType<typeof express> | null = null;

let lastInitError: string | null = null;

export async function createServerlessApp(): Promise<express.Express> {
  if (cachedApp) return cachedApp;
  if (lastInitError) throw new Error(lastInitError);

  let env;
  try {
    env = loadEnv();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    lastInitError = msg;
    console.error('[serverless] loadEnv failed:', msg);
    throw e;
  }
  const server = express();

  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    bodyParser: false,
    bufferLogs: true,
    logger: false,
  });

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  // Better Auth BEFORE body parsing (ADR 0007)
  const auth = await getAuth(app.get(PrismaService));
  server.use('/api/auth', auth.nodeHandler);

  // Body parsing for everything else
  app.use(express.json({ limit: BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));

  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });
  app.useGlobalFilters(new DomainExceptionFilter());
  app.setGlobalPrefix('api');

  await app.init();

  cachedApp = server;
  return server;
}

// Vercel expects a default export of the Express app
export default async function handler(req: express.Request, res: express.Response) {
  // Fast debug endpoint - bypasses Nest init, shows which envs are present (no values leaked)
  if (req.url?.startsWith('/api/debug-env') || req.url?.startsWith('/debug-env')) {
    const keys = ['DATABASE_URL','DATABASE_URL_UNPOOLED','BETTER_AUTH_SECRET','BETTER_AUTH_URL','CORS_ORIGINS','FIRST_SETUP_TOKEN','DOCUMENT_ARCHIVE_ROOT','NODE_ENV','API_PORT','API_HOST'];
    const present: Record<string, string> = {};
    for (const k of keys) {
      const v = process.env[k];
      present[k] = v ? `present len=${v.length} head=${v.slice(0,30)}...` : 'MISSING';
    }
    // Also try loadEnv validation without leaking
    let envError: string | null = null;
    try { loadEnv(); } catch (e) { envError = e instanceof Error ? e.message : String(e); }
    res.status(200).json({ present, envError, lastInitError, nodeVersion: process.version });
    return;
  }
  try {
    const app = await createServerlessApp();
    return app(req, res);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : '';
    console.error('[serverless] handler failed:', msg, stack?.slice(0,3000));
    if (!res.headersSent) {
      res.status(500).json({ error: 'FUNCTION_INIT_FAILED', message: msg, lastInitError });
    }
    return;
  }
}