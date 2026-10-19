import { Module } from '@nestjs/common';

import { env } from '../config/env.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { DocumentListService } from './document-list.service.js';
import { PaperPdfService } from './paper-pdf.service.js';
import { DocumentArchive } from '../sales/document-archive.js';

@Module({
  imports: [PrismaModule],
  providers: [
    DocumentListService,
    PaperPdfService,
    {
      // Same deployment configuration the Sales module binds: the archive root
      // is where issued documents live, and all documents — fiscal or
      // operational — share the one root and the one immutable-write rule.
      provide: DocumentArchive,
      useFactory: () => new DocumentArchive(env().DOCUMENT_ARCHIVE_ROOT),
    },
  ],
  exports: [DocumentListService, PaperPdfService],
})
export class DocumentsModule {}
