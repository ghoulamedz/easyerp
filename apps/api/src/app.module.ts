import { Module, type OnModuleInit } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditModule } from './audit/audit.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { HealthModule } from './health/health.module.js';
import { NumberingModule } from './numbering/numbering.module.js';
import { PermissionsGuard, SessionGuard } from './identity/authorization.js';
import { AuthModule } from './identity/auth/auth.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { RolesService } from './identity/roles.service.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { PartiesModule } from './parties/parties.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProductionModule } from './production/production.module.js';
import { PurchasingModule } from './purchasing/purchasing.module.js';
import { SalesModule } from './sales/sales.module.js';
import { ModulesGuard } from './settings/modules.guard.js';
import { SettingsModule } from './settings/settings.module.js';
import { SetupModule } from './setup/setup.module.js';

/**
 * Guard order matters and is declared here, once: the session is resolved first,
 * then whether the route's Module is switched on decides refusal before
 * permissions are compared. A disabled FINANCE Module refusing an invoice route
 * before its permission is checked is the honest error — the capability does not
 * exist, so "you lack permission" would be a lie. Registering them in any other
 * order would compare permissions against nothing, or refuse a capability that
 * exists.
 */
@Module({
  imports: [
    PrismaModule,
    AuthModule,
    IdentityModule,
    AuditModule,
    HealthModule,
    CatalogModule,
    DocumentsModule,
    PartiesModule,
    InventoryModule,
    NumberingModule,
    SalesModule,
    PurchasingModule,
    ProductionModule,
    PaymentsModule,
    SetupModule,
    SettingsModule,
  ],
  providers: [
    RolesService,
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: ModulesGuard },
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
