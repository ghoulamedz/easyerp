/**
 * The guards, tested against a fake session provider.
 *
 * These are the tests that stop the legacy security defects from returning. They
 * deliberately never touch a database: what is being checked is that the request
 * pipeline consults the session on every request and that permissions — not
 * roles — decide.
 */

import { describe, expect, it } from 'vitest';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import type { SessionUser } from '@easyerp/contracts';
import { DomainError } from '../common/errors.js';
import { IS_PUBLIC, PermissionsGuard, type SessionRequest, SessionGuard } from './authorization.js';
import type { SessionProvider } from './auth/session-provider.js';

function sessionUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: 'user_1',
    email: 'clerk@easyerp.test',
    displayName: 'Clerk',
    isActive: true,
    roleIds: ['role_clerk'],
    permissions: ['item:read', 'sales-order:create'],
    ...overrides,
  };
}

/** A session provider that returns whatever the test tells it to. */
function providerReturning(result: SessionUser | null): SessionProvider {
  return { resolve: async () => result };
}

function contextFor(
  request: SessionRequest,
  metadataKey?: string,
  metadata?: unknown,
): ExecutionContext {
  const handler = () => undefined;
  Reflect.defineMetadata(metadataKey ?? IS_PUBLIC, metadata, handler);
  return {
    getHandler: () => handler,
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function requestWith(headers: Record<string, string> = {}): SessionRequest {
  return { headers, method: 'GET', url: '/items' } as unknown as SessionRequest;
}

describe('SessionGuard', () => {
  const reflector = new Reflector();

  it('authenticates every request that is not explicitly public', async () => {
    const guard = new SessionGuard(reflector, providerReturning(sessionUser()));
    const request = requestWith();
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.sessionUser?.id).toBe('user_1');
  });

  it('refuses a request with no session', async () => {
    const guard = new SessionGuard(reflector, providerReturning(null));
    await expect(guard.canActivate(contextFor(requestWith()))).rejects.toThrowError(DomainError);
    await expect(guard.canActivate(contextFor(requestWith()))).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
    });
  });

  it('does not resolve a session at all for a public route', async () => {
    let resolved = 0;
    const guard = new SessionGuard(reflector, {
      resolve: async () => {
        resolved += 1;
        return null;
      },
    });
    const context = contextFor(requestWith(), IS_PUBLIC, true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(resolved).toBe(0);
  });

  it('re-reads the session on every request, so a disabled account stops working immediately', async () => {
    let current: SessionUser | null = sessionUser();
    const guard = new SessionGuard(reflector, { resolve: async () => current });

    const first = requestWith();
    await expect(guard.canActivate(contextFor(first))).resolves.toBe(true);
    expect(first.sessionUser).not.toBeUndefined();

    current = null;
    const second = requestWith();
    await expect(guard.canActivate(contextFor(second))).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(second.sessionUser).toBeUndefined();
  });
});

describe('PermissionsGuard', () => {
  const reflector = new Reflector();
  const guard = new PermissionsGuard(reflector);

  it('allows a route that requires nothing', () => {
    expect(guard.canActivate(contextFor(requestWith()))).toBe(true);
  });

  it('allows a caller holding every required permission', () => {
    const request = { ...requestWith(), sessionUser: sessionUser() } as SessionRequest;
    const context = contextFor(request, 'easyerp:permissions', ['item:read', 'sales-order:create']);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('refuses a caller missing one of the required permissions, and names it', () => {
    const request = { ...requestWith(), sessionUser: sessionUser() } as SessionRequest;
    const context = contextFor(request, 'easyerp:permissions', ['item:read', 'sales-order:issue']);
    expect(() => guard.canActivate(context)).toThrowError(/sales-order:issue/);
  });

  it('refuses a caller with no session rather than treating absence as permission', () => {
    const context = contextFor(requestWith(), 'easyerp:permissions', ['item:read']);
    expect(() => guard.canActivate(context)).toThrowError(/Authentication is required/);
  });

  it('takes effect the moment a permission is withdrawn, because the session is re-read', () => {
    const context = (permissions: string[]) =>
      contextFor(
        { ...requestWith(), sessionUser: sessionUser({ permissions }) } as SessionRequest,
        'easyerp:permissions',
        ['sales-order:create'],
      );

    expect(guard.canActivate(context(['sales-order:create']))).toBe(true);
    expect(() => guard.canActivate(context([]))).toThrowError(/sales-order:create/);
  });
});
