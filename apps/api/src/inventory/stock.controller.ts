/**
 * Inventory routes: the Stock Ledger (ADR 0004, spec 001 stories 49–57).
 *
 * Stock is read, opened, adjusted, reversed and exported — never "set". There is
 * deliberately no route that takes an on-hand from a client, because that is the
 * mutable-balance design this ledger replaced.
 */

import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { stockPositionListItemSchema, type SessionUser } from '@easyerp/contracts';

import { CurrentUser, RequirePermissions } from '../identity/authorization.js';
import { RequiresModule } from '../settings/modules.guard.js';
import { StockLedgerService } from './stock-ledger.service.js';

type Actor = { id: string; email: string };
const actorOf = (user: SessionUser): Actor => ({ id: user.id, email: user.email });
const ipOf = (request: Request): string | null => request.ip ?? null;

@Controller('inventory')
@RequiresModule('INVENTORY')
export class StockController {
  constructor(private readonly ledger: StockLedgerService) {}

  @RequirePermissions('stock:read')
  @Get('stock')
  async positions() {
    const rows = await this.ledger.listPositions();
    return rows.map((row) =>
      stockPositionListItemSchema.parse({
        itemId: row.itemId,
        code: row.code,
        name: row.name,
        onHand: row.onHand,
        reserved: row.reserved,
        available: row.available,
        reorderPoint: row.reorderPoint,
        atOrBelowReorder: row.atOrBelowReorder,
      }),
    );
  }

  /**
   * The same positions as a spreadsheet-ready file. UTF-8 with a byte order mark
   * and `;`-delimited: LibreOffice names `CSV` that whatever the OS locale is,
   * which is the closest a file can come to "just open it".
   */
  @RequirePermissions('stock:read')
  @Get('stock.csv')
  async csv(@Res() response: Response): Promise<void> {
    const rows = await this.ledger.listPositions();

    const header = 'code;name;onHand;reserved;available;reorderPoint;atOrBelowReorder';
    const lines = rows.map((row) =>
      [
        row.code,
        row.name,
        row.onHand,
        row.reserved,
        row.available,
        row.reorderPoint ?? '',
        row.atOrBelowReorder ? '1' : '0',
      ].join(';'),
    );

    const body = '\uFEFF' + [header, ...lines].join('\r\n');

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Length', Buffer.byteLength(body));
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="stock-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    response.status(HttpStatus.OK).send(body);
  }

  @RequirePermissions('stock:adjust')
  @Post('stock/open')
  @HttpCode(HttpStatus.CREATED)
  open(@Body() body: unknown, @CurrentUser() user: SessionUser, @Req() request: Request) {
    return this.ledger.open(body, actorOf(user), ipOf(request));
  }

  @RequirePermissions('stock:adjust')
  @Post('stock/adjust')
  @HttpCode(HttpStatus.CREATED)
  adjust(@Body() body: unknown, @CurrentUser() user: SessionUser, @Req() request: Request) {
    return this.ledger.adjust(body, actorOf(user), ipOf(request));
  }

  @RequirePermissions('stock:adjust')
  @Post('stock/reverse')
  @HttpCode(HttpStatus.CREATED)
  reverse(@Body() body: unknown, @CurrentUser() user: SessionUser, @Req() request: Request) {
    return this.ledger.reverse(body, actorOf(user), ipOf(request));
  }

  @RequirePermissions('stock:read')
  @Get('stock/entries/:itemId')
  entries(@Param('itemId') itemId: string) {
    // `entries` itself 404s on an unknown Item, so an Item with no movements and
    // an Item that does not exist are not the same answer.
    return this.ledger.entries(itemId);
  }
}
