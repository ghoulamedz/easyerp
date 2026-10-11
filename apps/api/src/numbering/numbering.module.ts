import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { DocumentNumberingService } from './document-numbering.service.js';

@Module({
  imports: [PrismaModule],
  providers: [DocumentNumberingService],
  exports: [DocumentNumberingService],
})
export class NumberingModule {}