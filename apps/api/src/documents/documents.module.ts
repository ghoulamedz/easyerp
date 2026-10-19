import { Module } from '@nestjs/common';

import { env } from '../config/env.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { DocumentListService } from './document-list.service.js';
import { PaperPdfService } from './paper-pdf.service.js';
import { archiveFromConfig, DocumentArchive } from '../sales/document-archive.js';

@Module({
  imports: [PrismaModule],
  providers: [
    DocumentListService,
    PaperPdfService,
    {
      // The one place the archive's location is decided, exported so every module
      // that files or serves a document shares this instance rather than building
      // a second one. The choice between disk and blob storage is configuration;
      // no service below this line knows which backend it is talking to.
      provide: DocumentArchive,
      useFactory: () => archiveFromConfig(env()),
    },
  ],
  exports: [DocumentListService, PaperPdfService, DocumentArchive],
})
export class DocumentsModule {}
