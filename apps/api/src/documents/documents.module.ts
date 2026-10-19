import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module.js';
import { DocumentListService } from './document-list.service.js';

/**
 * Reading Documents as lists and papers.
 *
 * There is no archive service and no renderer here any more: the Document row is
 * the record, and printing is a view of it, rendered on request from the columns
 * that were written once at issue (ADR 0010). Nothing is filed, so nothing has to
 * be found.
 */
@Module({
  imports: [PrismaModule],
  providers: [DocumentListService],
  exports: [DocumentListService],
})
export class DocumentsModule {}
