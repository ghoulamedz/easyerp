import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { DocumentListService } from './document-list.service.js';

@Module({
  imports: [PrismaModule],
  providers: [DocumentListService],
  exports: [DocumentListService],
})
export class DocumentsModule {}
