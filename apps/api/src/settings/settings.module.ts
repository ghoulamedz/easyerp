/**
 * Settings (spec 001 stories 8–20): the Administrator's configuration surface.
 *
 * This module owns the ModulesGuard, registered as an application-wide guard
 * next to the Session and Permissions guards in `app.module.ts`. It has to live
 * here — the guard is a Settings concept (Module state is a Business Setting)
 * and it needs `ModuleStateService`, which this module provides and exports.
 */

import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { BusinessSettingsService } from './business.service.js';
import { LabelService } from './label.service.js';
import { ModuleStateService } from './module-state.service.js';
import { NumberPatternService } from './number-pattern.service.js';
import {
  BusinessSettingsController,
  ModuleStateController,
  NumberPatternController,
  TaxRateController,
  TerminologyController,
  UnitController,
} from './settings.controller.js';
import { TaxRateService } from './tax-rate.service.js';
import { UnitService } from './unit.service.js';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [
    BusinessSettingsController,
    TaxRateController,
    UnitController,
    NumberPatternController,
    TerminologyController,
    ModuleStateController,
  ],
  providers: [
    BusinessSettingsService,
    TaxRateService,
    UnitService,
    NumberPatternService,
    LabelService,
    ModuleStateService,
  ],
  exports: [ModuleStateService, LabelService],
})
export class SettingsModule {}
