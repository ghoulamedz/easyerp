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

import { archiveUnavailable, notFound } from '../common/errors.js';
import { isPdfRendererAvailable, sharedPdfRenderer } from '../finance/pdf.js';
import { sha256Of } from '../finance/paper-archive.js';
import { PrismaService } from '../prisma/prisma.service.js';
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
   *
   * The HTML is always written, because every host can render HTML and Print
   * serves those bytes. The PDF is written only where a browser exists to
   * rasterise it: on a serverless host that copy is simply absent, and asking
   * `isPdfRendererAvailable` once is what stops every issue from paying for a
   * launch that cannot succeed.
   */
  async archiveAtIssue(
    kind: PaperKind,
    documentId: string,
    year: number,
    number: string,
    view: PaperView,
  ): Promise<void> {
    const html = renderPaperHtml(view);
    const storedHtml = await this.archive.store(kind, year, number, Buffer.from(html, 'utf8'), 'html');

    if (!(await isPdfRendererAvailable())) {
      await this.prisma.document.update({
        where: { id: documentId },
        data: { printPath: storedHtml.path, printSha256: storedHtml.sha256 },
      });
      return;
    }

    const renderer = await sharedPdfRenderer();
    const pdf = await renderer.toPdf(html);
    const stored = await this.archive.store(kind, year, number, pdf);

    await this.prisma.document.update({
      where: { id: documentId },
      data: {
        printPath: storedHtml.path,
        printSha256: storedHtml.sha256,
        archivePath: stored.path,
        archiveSha256: stored.sha256,
        archivedAt: new Date(),
      },
    });
  }

  /**
   * The archived print copy, served to the visitor's browser.
   *
   * This is the paper Print shows. It is read from the archive, never re-rendered:
   * a document filed in 2024 must print as it was filed, even after a label or a
   * template changed. A Draft has no filed copy and answers `NOT_FOUND`, and an
   * Issued document whose HTML is missing answers `ARCHIVE_UNAVAILABLE` — the
   * same two answers the PDF endpoint gives, for the same reasons.
   */
  async readPrint(kind: PaperKind, id: string): Promise<string> {
    const entity = paperEntityName(kind);

    const document = await this.prisma.document.findFirst({
      where: { id, type: kind },
      select: { id: true, number: true, status: true, issuedAt: true, printPath: true },
    });

    if (!document) throw notFound(entity, id);
    if (document.status !== 'ISSUED') throw notFound('Archived document', id);

    const year = document.issuedAt?.getUTCFullYear() ?? new Date().getUTCFullYear();
    const found = await this.archive.read(
      document.printPath,
      this.archive.pathFor(kind, year, document.number ?? '', 'html'),
    );

    if (found === null) throw archiveUnavailable(entity, id);

    return found.bytes.toString('utf8');
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
    const found = await this.archive.read(
      document.archivePath,
      this.archive.pathFor(kind, year, document.number ?? ''),
    );

    if (found === null) throw archiveUnavailable(entity, id);

    // A root that moved is the one case where the recorded path is stale; the
    // row is corrected so the next read does not have to search again.
    if (found.path !== document.archivePath) {
      await this.prisma.document.update({
        where: { id: document.id },
        data: {
          archivePath: found.path,
          archiveSha256: sha256Of(found.bytes),
          archivedAt: new Date(),
        },
      });
    }

    return { pdf: found.bytes, sha256: document.archiveSha256 ?? sha256Of(found.bytes) };
  }
}
