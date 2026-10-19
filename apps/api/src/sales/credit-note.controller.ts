/**
 * Credit Note routes (spec 001 stories 63–69; ADR 0006, ADR 0016, ADR 0017).
 *
 * Permission-gated like every other route: a Credit Note corrects a fiscal
 * document, so creating or issuing one without `credit-note:create` would be
 * authorization by interface-hiding. There is no DELETE route — a fiscal
 * document is never removed; `credit-note:delete` in the catalog means Draft
 * only and is enforced by the transition guard, not by a route.
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
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { type CreditNote, type SessionUser } from '@easyerp/contracts';

import { CurrentUser, RequirePermissions } from '../identity/authorization.js';
import { RequiresModule } from '../settings/modules.guard.js';
import { sendPrint } from '../common/print-response.js';
import {
  DocumentListService,
  type DocumentPage,
} from '../documents/document-list.service.js';
import { CreditNoteService } from './credit-note.service.js';

type Actor = { id: string; email: string };
const actorOf = (user: SessionUser): Actor => ({ id: user.id, email: user.email });
const ipOf = (request: Request): string | null => request.ip ?? null;

@Controller('credit-notes')
@RequiresModule('FINANCE')
export class CreditNoteController {
  constructor(
    private readonly notes: CreditNoteService,
    private readonly documents: DocumentListService,
  ) {}

  @RequirePermissions('credit-note:read')
  @Get()
  list(@Query() query: unknown): Promise<DocumentPage> {
    return this.documents.list('CREDIT_NOTE', query);
  }

  @RequirePermissions('credit-note:create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createDraft(
    @Body() payload: unknown,
    @CurrentUser() user: SessionUser,
    @Req() request: Request,
  ): Promise<{ id: string; status: string }> {
    return this.notes.createDraft(payload, actorOf(user), ipOf(request));
  }

  @RequirePermissions('credit-note:issue')
  @Post(':id/issue')
  @HttpCode(HttpStatus.CREATED)
  async issue(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Req() request: Request,
  ): Promise<CreditNote> {
    return this.notes.issue(id, actorOf(user), ipOf(request));
  }

  @RequirePermissions('credit-note:read')
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<CreditNote> {
    const note = await this.notes.findById(id);
    if (!note) throw new NotFoundException(`No Credit Note ${id}`);
    return note;
  }


  /**
   * The print copy: the paper rendered from the stored row and rasterised by the
   * visitor's own browser, so no host needs a browser to serve it.
   */
  @RequirePermissions('credit-note:read')
  @Get(':id/print')
  async print(@Param('id') id: string, @Res() response: Response): Promise<void> {
    sendPrint(response, id, await this.notes.readPrint(id));
  }
}
