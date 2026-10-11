/**
 * First-run Setup routes (ADR 0012).
 *
 * Both routes are `@Public()`: a fresh deployment has no User yet, so this is
 * the one part of the API that must answer before authentication exists. They
 * are deliberately the only two.
 *
 * `status` always answers `{ needsSetup: boolean }` — the web app asks it to
 * decide between the Setup screen and the sign-in screen. The *write* route,
 * `complete`, returns 404 as soon as a Business exists and stays that way: there
 * is no administrative override and the same request can never succeed twice,
 * whatever credentials or token it carries.
 */

import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { type SetupResult, type SetupStatus } from '@easyerp/contracts';

import { Public } from '../identity/authorization.js';
import { SetupService } from './setup.service.js';

@Controller('setup')
export class SetupController {
  constructor(private readonly setup: SetupService) {}

  @Public()
  @Get('status')
  async status(): Promise<SetupStatus> {
    return this.setup.getStatus();
  }

  @Public()
  @Post('complete')
  @HttpCode(HttpStatus.CREATED)
  async complete(@Body() body: unknown, @Req() request: Request): Promise<SetupResult> {
    return this.setup.complete(body, request.ip);
  }
}
