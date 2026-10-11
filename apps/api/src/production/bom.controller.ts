/**
 * Bill of Materials routes.
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import {
  createBomSchema,
  createBomVersionSchema,
  type Bom,
  type BomSummary,
  type BomVersion,
  type SessionUser,
} from '@easyerp/contracts';

import { CurrentUser, RequirePermissions } from '../identity/authorization.js';
import { BomService } from './bom.service.js';
import { RequiresModule } from '../settings/modules.guard.js';

@Controller('production/boms')
@RequiresModule('PRODUCTION')
export class BomController {
  constructor(private readonly boms: BomService) {}

  @RequirePermissions('bom:create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: unknown,
    @CurrentUser() _user: SessionUser,
    @Req() _request: Request,
  ): Promise<Bom> {
    return this.boms.create(body);
  }

  @RequirePermissions('bom:create')
  @Post(':id/versions')
  @HttpCode(HttpStatus.CREATED)
  async createVersion(
    @Param('id') id: string,
    @Body() body: { lines: Array<{ itemId: string; quantity: string; unitOfMeasureId: string }> },
    @CurrentUser() _user: SessionUser,
    @Req() _request: Request,
  ): Promise<BomVersion> {
    return this.boms.createVersion({ ...body, bomId: id });
  }

  @RequirePermissions('bom:read')
  @Get()
  async list(): Promise<BomSummary[]> {
    return this.boms.list();
  }

  @RequirePermissions('bom:read')
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Bom> {
    const bom = await this.boms.findById(id);
    if (!bom) throw new NotFoundException(`No BOM ${id}`);
    return bom;
  }

  @RequirePermissions('bom:read')
  @Get('item/:finishedItemId')
  async findByFinishedItem(@Param('finishedItemId') finishedItemId: string): Promise<Bom | null> {
    return this.boms.findByFinishedItem(finishedItemId);
  }

  @RequirePermissions('bom:read')
  @Get('versions/:versionId')
  async findVersion(@Param('versionId') versionId: string): Promise<BomVersion> {
    const version = await this.boms.findVersionById(versionId);
    if (!version) throw new NotFoundException(`No BOM version ${versionId}`);
    return version;
  }
}

export { createBomSchema, createBomVersionSchema };