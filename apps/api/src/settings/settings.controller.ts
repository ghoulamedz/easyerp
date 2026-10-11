/**
 * The Settings routes (spec 001 stories 8–20): the Administrator's own surface
 * for how the Business is configured — profile, tax rates, units, numbering,
 * terminology, and the Module switch. Every route carries an audit entry and
 * requires the matching permission; the refusal of a disabled Module happens in
 * the ModulesGuard, one guard shared by every controller, not per route here.
 */

import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  type BusinessProfile,
  type LabelRecord,
  type ModuleState,
  type NumberPatternRecord,
  type TaxRateRecord,
  type UnitRecord,
  type SessionUser,
} from '@easyerp/contracts';

import { CurrentUser, RequirePermissions } from '../identity/authorization.js';
import { BusinessSettingsService } from './business.service.js';
import { LabelService } from './label.service.js';
import { ModuleStateService } from './module-state.service.js';
import { NumberPatternService } from './number-pattern.service.js';
import { TaxRateService } from './tax-rate.service.js';
import { UnitService } from './unit.service.js';

type Actor = { id: string; email: string };
const actorOf = (user: SessionUser): Actor => ({ id: user.id, email: user.email });
const ipOf = (request: Request): string | null => request.ip ?? null;

@Controller('settings/business')
export class BusinessSettingsController {
  constructor(private readonly business: BusinessSettingsService) {}

  @RequirePermissions('business-settings:read')
  @Get()
  get(): Promise<BusinessProfile> {
    return this.business.get();
  }

  @RequirePermissions('business-settings:update')
  @Patch()
  update(
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
    @Req() request: Request,
  ): Promise<BusinessProfile> {
    return this.business.update(body, actorOf(user), ipOf(request));
  }
}

@Controller('settings/tax-rates')
export class TaxRateController {
  constructor(private readonly taxRates: TaxRateService) {}

  @RequirePermissions('tax-rate:manage')
  @Get()
  list(): Promise<TaxRateRecord[]> {
    return this.taxRates.list();
  }

  @RequirePermissions('tax-rate:manage')
  @Post()
  create(
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
    @Req() request: Request,
  ): Promise<TaxRateRecord> {
    return this.taxRates.create(body, actorOf(user), ipOf(request));
  }

  @RequirePermissions('tax-rate:manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
    @Req() request: Request,
  ): Promise<TaxRateRecord> {
    return this.taxRates.update(id, body, actorOf(user), ipOf(request));
  }
}

@Controller('settings/units')
export class UnitController {
  constructor(private readonly units: UnitService) {}

  @RequirePermissions('business-settings:read')
  @Get()
  list(): Promise<UnitRecord[]> {
    return this.units.list();
  }

  @RequirePermissions('business-settings:update')
  @Post()
  create(
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
    @Req() request: Request,
  ): Promise<UnitRecord> {
    return this.units.create(body, actorOf(user), ipOf(request));
  }

  @RequirePermissions('business-settings:update')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
    @Req() request: Request,
  ): Promise<UnitRecord> {
    return this.units.update(id, body, actorOf(user), ipOf(request));
  }
}

@Controller('settings/number-patterns')
export class NumberPatternController {
  constructor(private readonly patterns: NumberPatternService) {}

  @RequirePermissions('number-series:manage')
  @Get()
  list(): Promise<NumberPatternRecord[]> {
    return this.patterns.list();
  }

  @RequirePermissions('number-series:manage')
  @Put(':code')
  set(
    @Param('code') code: string,
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
    @Req() request: Request,
  ): Promise<NumberPatternRecord> {
    return this.patterns.set(code, body, actorOf(user), ipOf(request));
  }
}

@Controller('settings/labels')
export class TerminologyController {
  constructor(private readonly labels: LabelService) {}

  @RequirePermissions('terminology:manage')
  @Get()
  list(@Query('entityType') entityType: string): Promise<LabelRecord[]> {
    return this.labels.list(entityType);
  }

  @RequirePermissions('terminology:manage')
  @Put()
  async upsert(
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Response> {
    const result = await this.labels.upsert(body, actorOf(user), ipOf(request));
    // Nest's default serializer omits a returned `null`, which would leave the
    // client with an empty 200 body and no way to tell "override deleted" from
    // "nothing came back". Writing `null` explicitly keeps the wire honest.
    return response.json(result);
  }
}

@Controller('settings/modules')
export class ModuleStateController {
  constructor(private readonly modules: ModuleStateService) {}

  @RequirePermissions('business-settings:read')
  @Get()
  list(): Promise<ModuleState[]> {
    return this.modules.list();
  }

  @RequirePermissions('business-settings:update')
  @Put(':module')
  set(
    @Param('module') module: string,
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
    @Req() request: Request,
  ): Promise<ModuleState> {
    return this.modules.set(module as ModuleState['module'], body, actorOf(user), ipOf(request));
  }
}
