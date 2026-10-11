/**
 * Business profile routes (spec 001 stories 8–9), the Administrator's own
 * Settings for the identity every fiscal document quotes (ADR 0011).
 */

import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import type { Request } from 'express';

import type { BusinessProfile } from '@easyerp/contracts';

import { CurrentUser, RequirePermissions } from '../identity/authorization.js';
import type { SessionUser } from '@easyerp/contracts';
import { BusinessSettingsService } from './business.service.js';

@Controller('settings/business')
export class BusinessSettingsController {
  constructor(private readonly business: BusinessSettingsService) {}

  @RequirePermissions('business-settings:read')
  @Get()
  async get(): Promise<BusinessProfile> {
    return this.business.get();
  }

  @RequirePermissions('business-settings:update')
  @Patch()
  async update(
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
    @Req() request: Request,
  ): Promise<BusinessProfile> {
    return this.business.update(body, { id: user.id, email: user.email }, request.ip);
  }
}
