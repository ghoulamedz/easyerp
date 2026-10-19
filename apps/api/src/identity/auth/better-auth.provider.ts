/**
 * Better Auth, mounted on the Nest HTTP adapter and reached only through
 * `SessionProvider` (ADR 0007).
 *
 * Better Auth is loaded with a dynamic import because it ships ESM while the API
 * compiles to CommonJS; turning the whole API into ESM to avoid one dynamic
 * import would buy nothing here.
 */

import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { toNodeHandler } from 'better-auth/node';
import { type SessionUser } from '@easyerp/contracts';
import { env } from '../../config/env.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { type SessionProvider, readSessionHeaders } from './session-provider.js';
import { mayObtainSession, toSessionUser } from './session-user.js';
import { trustedOrigins } from './trusted-origins.js';

/** The Express handler that serves `/api/auth/*`. */
export type NodeAuthHandler = ReturnType<typeof toNodeHandler>;

export interface BetterAuthInstance {
  nodeHandler: NodeAuthHandler;
  api: {
    getSession: (options: { headers: Headers }) => Promise<{ user: unknown } | null>;
  };
}

/**
 * What `hooks.before` receives at runtime: the request plus Better Auth's own
 * context, whose `isTrustedOrigin`/`trustedOrigins` are the predicate and list
 * the origin middleware will use a moment later.
 */
interface EndpointContext {
  readonly request?: { readonly headers: { get: (name: string) => string | null } } | undefined;
  readonly context: {
    readonly trustedOrigins: readonly string[];
    readonly isTrustedOrigin: (url: string) => boolean;
  };
}

/** The Origin Better Auth would reject, with the list it measures against. */
function rejectedOrigin(ctx: EndpointContext): { origin: string; trusted: string[] } | undefined {
  // Defensive on both hops: this hook must observe, never fail a request. If a
  // future better-auth hands a different context shape, the diagnostic goes
  // quiet and the origin check itself is untouched.
  const origin = ctx?.request?.headers?.get('origin');
  if (!origin || origin === 'null') return undefined;
  const decision = ctx?.context;
  if (typeof decision?.isTrustedOrigin !== 'function') return undefined;
  if (decision.isTrustedOrigin(origin)) return undefined;
  return { origin, trusted: [...(decision.trustedOrigins ?? [])] };
}

/**
 * One warning per rejected Origin, not one per attempt: a browser retrying a
 * sign-in must not turn a single misconfiguration into a wall of log lines.
 */
const reportedRejectedOrigins = new Set<string>();

function warnRejectedOrigin(origin: string, trusted: readonly string[]): void {
  if (reportedRejectedOrigins.has(origin)) return;
  reportedRejectedOrigins.add(origin);
  process.stderr.write(
    `[auth] origin rejected: ${origin} is not in trustedOrigins [${trusted.join(', ')}]. ` +
      'Set CORS_ORIGINS to the web origin the browser uses; Vercel hostnames are added automatically.\n',
  );
}

/**
 * One instance per PrismaService: the adapter closes over the client it was
 * built with, so a single module-level instance would keep serving the first
 * client's connection after tests (or a second module) hand over another.
 */
const instances = new WeakMap<PrismaService, BetterAuthInstance>();

export async function getAuth(prisma: PrismaService): Promise<BetterAuthInstance> {
  const cached = instances.get(prisma);
  if (cached) return cached;
  const created = await createBetterAuth(prisma);
  instances.set(prisma, created);
  return created;
}

async function createBetterAuth(prisma: PrismaService): Promise<BetterAuthInstance> {
  const [{ betterAuth }, { prismaAdapter }, { toNodeHandler: toNode }] = await Promise.all([
    import('better-auth'),
    import('better-auth/adapters/prisma'),
    import('better-auth/node'),
  ]);

  // The web origin, plus the Vercel hostnames when they exist. The CORS layer in
  // `main.ts` builds its list with this same function, so the two cannot drift.
  const origins = trustedOrigins({
    corsOrigins: env().CORS_ORIGINS,
    vercelUrl: env().VERCEL_URL,
    vercelProjectProductionUrl: env().VERCEL_PROJECT_PRODUCTION_URL,
  });

  const auth = betterAuth({
    // The adapter is typed against its own Prisma build; the shape it needs is
    // the one our generated client has.
    database: prismaAdapter(prisma as never, { provider: 'postgresql' }),
    secret: env().BETTER_AUTH_SECRET,
    // The browser's URL for `/api/auth/*`, i.e. the web origin — not the API's
    // own hostname. Better Auth derives cookies, links and its implicit trusted
    // origin from this value, and the only origin a browser ever presents here
    // is the one it called, which is the web app's (see `config/env.ts`).
    baseURL: env().BETTER_AUTH_URL,
    trustedOrigins: origins,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: false,
    },
    session: {
      modelName: 'AuthSession',
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    user: {
      modelName: 'AuthUser',
      fields: {
        name: 'name',
        email: 'email',
        emailVerified: 'emailVerified',
        image: 'image',
      },
      // `isActive` is ours, not Better Auth's (a bare account has no such thing
      // in the framework). Until it is read back into the session output, the
      // resolve path in `session-user.ts` sees an undefined `isActive` and turns
      // every account into a session that does not exist — the guards then 401
      // everyone, which is indistinguishable from "no authentication here" and
      // therefore an easy thing for an integration suite to never catch. Declaring
      // it `input: false` keeps clients from writing it through Better Auth; the
      // role table and an administrator own activation, not the sign-up form.
      additionalFields: {
        isActive: { type: 'boolean', required: false, defaultValue: true, input: false },
      },
    },
    account: { modelName: 'AuthAccount' },
    databaseHooks: {
      // A removed or deactivated user must not obtain a session: Better Auth
      // signs in from the credential alone and knows nothing of `isActive`
      // or `deletedAt`. Refusing the session row fails the sign-in itself
      // (401) instead of minting a token the guards then ignore.
      session: {
        create: {
          before: async (session) => {
            const userId = (session as { userId?: unknown }).userId;
            if (typeof userId !== 'string') return false;
            const row = await prisma.authUser.findUnique({
              where: { id: userId },
              select: { isActive: true, deletedAt: true },
            });
            if (!mayObtainSession(row)) return false;
            return;
          },
        },
      },
    },
    /// Better Auth verifies this table exists before serving any request, so it
    /// must be named here as well as created in the schema.
    verification: { modelName: 'AuthVerification' },
    hooks: {
      /**
       * A rejected origin is a 403 that names nothing: Better Auth throws from
       * inside its own middleware, and the process's logger is not wired to
       * anything a deployment keeps. This hook runs before that middleware,
       * asks Better Auth's own `isTrustedOrigin` — the predicate that will
       * decide — and warns once per rejected Origin with the list it was
       * measured against. It observes only: the request is then accepted or
       * rejected exactly as it would have been.
       */
      before: async (ctx) => {
        // `hooks.before` is typed as a bare middleware context, but the dispatcher
        // hands it the endpoint context, which is where Better Auth's origin
        // decision lives (see `dispatchAuthEndpoint` in better-auth).
        const rejected = rejectedOrigin(ctx as unknown as EndpointContext);
        if (rejected) warnRejectedOrigin(rejected.origin, rejected.trusted);
      },
    },
    advanced: {
      useSecureCookies: env().isProduction,
      cookiePrefix: 'easyerp',
    },
  });

  return {
    nodeHandler: toNode(auth),
    api: auth.api as unknown as BetterAuthInstance['api'],
  };
}

@Injectable()
export class BetterAuthSessionProvider implements SessionProvider, OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await getAuth(this.prisma);
  }

  async resolve(
    headers: Record<string, string | string[] | undefined>,
  ): Promise<SessionUser | null> {
    const { cookie, authorization } = readSessionHeaders(headers);
    if (!cookie && !authorization) return null;

    const requestHeaders = new Headers();
    if (cookie) requestHeaders.set('cookie', cookie);
    if (authorization) requestHeaders.set('authorization', authorization);

    const auth = await getAuth(this.prisma);
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session) return null;

    return this.toSessionUser(session.user);
  }

  /**
   * Map the auth record onto the contract and enforce the account's active flag
   * here, not in a guard. An `isEnabled` that returns a hardcoded true is the
   * legacy defect exactly: a field that exists, is editable, and does nothing.
   */
  private async toSessionUser(user: unknown): Promise<SessionUser | null> {
    const assignments = await this.prisma.userRole.findMany({
      where: { userId: (user as { id?: string }).id ?? '' },
      include: { role: { select: { permissions: true } } },
    });

    return toSessionUser(
      user,
      assignments.map((assignment) => ({
        roleId: assignment.roleId,
        permissions: assignment.role.permissions,
      })),
    );
  }
}
