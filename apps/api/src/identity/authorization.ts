/**
 * Route authorization.
 *
 * Permissions, not roles, decide. A route states the permissions it needs and the
 * guards compare them against the permissions the session's roles grant. The
 * interface plays no part: hiding a button is a courtesy, not a control.
 */

import {
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import type { Request } from 'express';
import { type Permission, type SessionUser, hasPermission } from '@easyerp/contracts';
import { Reflector } from '@nestjs/core';
import { forbidden, unauthorized } from '../common/errors.js';
import { SESSION_PROVIDER, type SessionProvider } from './auth/session-provider.js';

export const IS_PUBLIC = 'easyerp:public';
export const REQUIRED_PERMISSIONS = 'easyerp:permissions';

declare module 'express' {
  interface Request {
    sessionUser?: SessionUser;
  }
}

/** Opt a route out of authentication. Reserved for liveness, readiness and auth itself. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);

/** The permissions a route requires. All of them; there is no "any of". */
export const RequirePermissions = (
  ...permissions: Permission[]
): MethodDecorator & ClassDecorator => SetMetadata(REQUIRED_PERMISSIONS, permissions);

export interface SessionRequest extends Request {
  sessionUser?: SessionUser;
}

@Injectable()
export class SessionGuard {
  constructor(
    private readonly reflector: Reflector,
    @Inject(SESSION_PROVIDER) private readonly sessions: SessionProvider,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<SessionRequest>();
    const sessionUser = await this.sessions.resolve(request.headers);

    if (!sessionUser) {
      throw unauthorized();
    }

    request.sessionUser = sessionUser;
    return true;
  }
}

@Injectable()
export class PermissionsGuard {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(
      REQUIRED_PERMISSIONS,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const { sessionUser } = context.switchToHttp().getRequest<SessionRequest>();
    if (!sessionUser) throw unauthorized();

    const missing = required.filter(
      (permission) => !hasPermission(sessionUser.permissions, permission),
    );
    if (missing.length > 0) {
      throw forbidden(`Missing permission: ${missing.join(', ')}`);
    }

    return true;
  }
}

/** The caller, on a route that a guard has already authenticated. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionUser => {
    const { sessionUser } = context.switchToHttp().getRequest<SessionRequest>();
    if (!sessionUser) throw unauthorized();
    return sessionUser;
  },
);
