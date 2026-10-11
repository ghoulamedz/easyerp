/**
 * Setup: the one-time provisioning path (ADR 0012).
 *
 * Kept as its own module rather than folded into settings because the two have
 * opposite authorization: Setup is the only unauthenticated write in the
 * product, and Settings is Administrator-only, authenticated work. Merging them
 * would make the exception the default shape of the module.
 */

import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module.js';
import { SetupController } from './setup.controller.js';
import { SetupService } from './setup.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [SetupController],
  providers: [SetupService],
})
export class SetupModule {}
