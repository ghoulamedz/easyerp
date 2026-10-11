/**
 * The ModulesGuard: the server half of "a disabled Module refuses every request"
 * (spec 001 story 20, CONTEXT.md).
 *
 * Permissions decide what a user may do; Modules decide whether a capability
 * exists at all. A route in a disabled Module is refused before its permissions
 * are even interesting, because "you are not authorised" would be a lie — the
 * capability does not exist here. The refusal is a 403 either way.
 *
 * The check reads the Module's state on every request and caches nothing, so a
 * switch flips the very next request. The write path (`ModuleStateService.set`)
 * has no cache to invalidate, which is why there is none to keep in sync.
 */

import { type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { type ModuleCode } from '@easyerp/contracts';

import { forbidden } from '../common/errors.js';
import { ModuleStateService } from './module-state.service.js';

export const REQUIRED_MODULE = 'easyerp:module';

/**
 * Declare the Module this controller (or route) belongs to. A Business that
 * switches the Module off is refused any of these routes, whatever it sends.
 */
export const RequiresModule = (module: ModuleCode): MethodDecorator & ClassDecorator =>
  Reflect.metadata(REQUIRED_MODULE, module);

@Injectable()
export class ModulesGuard {
  constructor(
    private readonly reflector: Reflector,
    private readonly modules: ModuleStateService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<ModuleCode | undefined>(REQUIRED_MODULE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    if (!(await this.modules.isEnabled(required))) {
      throw forbidden(
        `The ${required} Module is disabled for this Business. Enable it in Settings to use these endpoints.`,
      );
    }
    return true;
  }
}
