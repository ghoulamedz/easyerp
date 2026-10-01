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
import { toSessionUser } from './session-user.js';

/** The Express handler that serves `/api/auth/*`. */
export type NodeAuthHandler = ReturnType<typeof toNodeHandler>;

export interface BetterAuthInstance {
  nodeHandler: NodeAuthHandler;
  api: {
    getSession: (options: { headers: Headers }) => Promise<{ user: unknown } | null>;
  };
}

let instance: BetterAuthInstance | undefined;

export async function getAuth(prisma: PrismaService): Promise<BetterAuthInstance> {
  instance ??= await createBetterAuth(prisma);
  return instance;
}

async function createBetterAuth(prisma: PrismaService): Promise<BetterAuthInstance> {
  const [{ betterAuth }, { prismaAdapter }, { toNodeHandler: toNode }] = await Promise.all([
    import('better-auth'),
    import('better-auth/adapters/prisma'),
    import('better-auth/node'),
  ]);

  const auth = betterAuth({
    // The adapter is typed against its own Prisma build; the shape it needs is
    // the one our generated client has.
    database: prismaAdapter(prisma as never, { provider: 'postgresql' }),
    secret: env().BETTER_AUTH_SECRET,
    baseURL: env().BETTER_AUTH_URL,
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
    },
    account: { modelName: 'AuthAccount' },
    /// Better Auth verifies this table exists before serving any request, so it
    /// must be named here as well as created in the schema.
    verification: { modelName: 'AuthVerification' },
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
