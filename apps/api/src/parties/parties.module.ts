/**
 * Counterparties (spec 001 stories 28–32): one composite Party record holding
 * both commercial roles, with CUSTOMER terms enforced server-side.
 */

import { Module } from '@nestjs/common';

import { PartyController } from './party.controller.js';
import { PartyService } from './party.service.js';

@Module({
  controllers: [PartyController],
  providers: [PartyService],
})
export class PartiesModule {}
