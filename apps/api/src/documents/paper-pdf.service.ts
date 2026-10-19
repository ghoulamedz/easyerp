/**
 * Render, archive and serve the operational papers (ADR 0010).
 *
 * The five papers share one pipeline: at issue the service builds a `PaperView`
 * from the rows it just committed and hands it to `archiveAtIssue`, which
 * renders through the shared Chromium renderer, stores the bytes with the same
 * immutable `DocumentArchive` the fiscal documents use, and records the path and
 * hash on the row. `readArchive` then serves those	bytes like every other
 * archived document.
 *
 * ## The archive is the only render store
 *
 * Like the Customer Invoice, a paper is rendered when it is issued, not on
 * view. A view request runs two `readFile` attempts (the stored path, then the
 * path the current root computes) and answers `ARCHIVE_UNAVAILABLE` when both
 * miss — never a re-render: a host without a browser cannot render, and a
 * fallback that silently depends on one is exactly the failure mode this
 * module exists to remove.
 */

import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';

import { archiveUnavailable, notFound } from '../common/errors.js';
import { sharedPdfRenderer } from '../finance/pdf.js';
import { PrismaService } from '../prisma/prisma.service.js';
// A value import, not `import type`: `emitDecoratorMetadata` writes this
// constructor's parameter types into `design:paramtypes`, and a type-only
// import is erased before that runs — the parameter would be recorded as
// `Function` and Nest would fail to resolve `DocumentArchive` at boot. The
// same reason `main.ts` must be compiled by `tsc` and never by esbuild.
import { DocumentArchive } from '../sales/document-archive.js';
import { paperEntityName, type PaperKind, type PaperView } from './paper-document.js';
import { renderPaperHtml } from './paper-template.js';

export interface ArchivedPaper {
  readonly pdf: Buffer;
  readonly sha256: string;
}

@Injectable()
export class PaperPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly archive: DocumentArchive,
  ) {}

  /**
   * Archive the paper of a document that has just been issued. Called *after*
   * the issue transaction commits and intended to be awaited — a throwing call
   * must be caught by the caller so a renderer outage cannot undo an issued
   * document's number (the same concession the Customer Invoice makes).
   */
  async archiveAtIssue(
    kind: PaperKind,
    documentId: string,
    year: number,
    number: string,
    view: PaperView,
  ): Promise<void> {
    const renderer = await sharedPdfRenderer();
    const pdf = await renderer.toPdf(renderPaperHtml(view));

    const stored = await this.archive.store(kind, year, number, pdf);

    await this.prisma.document.update({
      where: { id: documentId },
      data: { archivePath: stored.path, archiveSha256: stored.sha256, archivedAt: new Date() },
    });
  }

  /**
   * The archived copy of an issued paper. A Draft (or a Cancelled document, and
   * in any case everything not Issued) has no archive and answers the same
   * typed `notFound` the fiscal documents throw; an Issued document whose bytes
   * are gone from the archive answers `ARCHIVE_UNAVAILABLE`.
   */
  async readArchive(kind: PaperKind, id: string): Promise<ArchivedPaper> {
    const entity = paperEntityName(kind);

    const document = await this.prisma.document.findFirst({
      where: { id, type: kind },
      select: {
        id: true,
        number: true,
        status: true,
        issuedAt: true,
        archivePath: true,
        archiveSha256: true,
      },
    });

    if (!document) throw notFound(entity, id);
    if (document.status !== 'ISSUED') {
      throw notFound('Archived document', id);
    }

    const year = document.issuedAt?.getUTCFullYear() ?? new Date().getUTCFullYear();
    const expectedPath = this.archive.pathFor(kind, year, document.number ?? '');

    // The stored path is authoritative when it exists: the archived bytes are
    // the ones the Business is answerable for.
    if (document.archivePath !== null) {
      try {
        const pdf = await readFile(document.archivePath);
        return { pdf, sha256: document.archiveSha256 ?? '' };
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw cause;
        }
        // File missing at the stored path — fall through to the computed one.
      }
    }

    // A root that moved: the file may exist under the currently computed root.
    if (expectedPath !== document.archivePath) {
      try {
        const pdf = await readFile(expectedPath);
        const { createHash } = await import('node:crypto');
        const sha256 = createHash('sha256').update(pdf).digest('hex');
        await this.prisma.document.update({
          where: { id: document.id },
          data: { archivePath: expectedPath, archiveSha256: sha256, archivedAt: new Date() },
        });
        return { pdf, sha256 };
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw cause;
        }
        // Missing at the computed path too — the archive is gone.
      }
    }

    throw archiveUnavailable(entity, id);
  }
}
