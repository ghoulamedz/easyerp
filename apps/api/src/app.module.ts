import { Module, type OnModuleInit } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditModule } from './audit/audit.module.js';
import { HealthModule } from './health/health.module.js';
import { PermissionsGuard, SessionGuard } from './identity/authorization.js';
import { AuthModule } from './identity/auth/auth.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { RolesService } from './identity/roles.service.js';
import { PrismaModule } from './prisma/prisma.module.js';

/**
 * Guard order matters and is declared here, once: the session is resolved first,
 * then the permissions are compared against it. Registering them the other way
 * round would compare permissions against nothing.
 */
@Module({
  imports: [PrismaModule, AuthModule, IdentityModule, AuditModule, HealthModule],
  providers: [
    RolesService,
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements OnModuleInit {
  constructor(private readonly roles: RolesService) {}

  /**
   * Repair the Administrator role at boot. If a role was emptied or unprotected
   * by hand, the next restart puts it back, before any request is served.
   */
  async onModuleInit(): Promise<void> {
    await this.roles.ensureAdministrator();
  }
}
