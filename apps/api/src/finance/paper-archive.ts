/**
 * Filing and reading the two papers that are also tax documents: the Customer
 * Invoice and the Credit Note.
 *
 * They share this code rather than each carrying their own copy because the
 * rules are identical and the failure that matters — one of the two writing the
 * HTML but not the PDF, or serving a re-render where an archived copy exists —
 * is exactly the kind of divergence duplication invites.
 */

import { createHash } from 'node:crypto';

import { archiveUnavailable, notFound } from '../common/errors.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { DocumentArchive } from '../sales/document-archive.js';
import { isPdfRendererAvailable, sharedPdfRenderer } from './pdf.js';

export interface ArchiveInvoicePaperInput {
  readonly prisma: PrismaService;
  readonly archive: DocumentArchive;
  /** The document type, which is also the archive directory. */
  readonly code: string;
  readonly documentId: string;
  readonly year: number;
  readonly number: string;
  readonly html: string;
}

/**
 * File the HTML always, the PDF only where a browser exists.
 *
 * The HTML comes first and on its own, so a host that cannot rasterise still
 * ends up with a complete, printable document instead of an issue that produced
 * nothing. Only the archive columns are written, which the immutability trigger
 * deliberately permits: the file name is the document number, so the number must
 * be committed before any file can exist.
 */
export async function archiveInvoicePaper(input: ArchiveInvoicePaperInput): Promise<void> {
  const { prisma, archive, code, documentId, year, number, html } = input;

  const storedHtml = await archive.store(code, year, number, Buffer.from(html, 'utf8'), 'html');

  if (!(await isPdfRendererAvailable())) {
    await prisma.document.update({
      where: { id: documentId },
      data: { printPath: storedHtml.path, printSha256: storedHtml.sha256 },
    });
    return;
  }

  const renderer = await sharedPdfRenderer();
  const pdf = await renderer.toPdf(html);
  const stored = await archive.store(code, year, number, pdf);

  await prisma.document.update({
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

export interface ReadInvoicePrintInput {
  readonly prisma: PrismaService;
  readonly archive: DocumentArchive;
  readonly code: string;
  readonly id: string;
  /** The name the API answers with when the document does not exist. */
  readonly entity: string;
}

/**
 * The archived HTML of an issued Invoice or Credit Note.
 *
 * A Draft has no filed copy and answers `NOT_FOUND`; an Issued document whose
 * file is missing answers `ARCHIVE_UNAVAILABLE`. Neither re-renders: a document
 * filed last year must print as it was filed.
 */
export async function readInvoicePrint({
  prisma,
  archive,
  code,
  id,
  entity,
}: ReadInvoicePrintInput): Promise<string> {
  const document = await prisma.document.findFirst({
    where: { id, type: code },
    select: { number: true, status: true, issuedAt: true, printPath: true },
  });

  if (!document) throw notFound(entity, id);
  if (document.status !== 'ISSUED') throw notFound('Archived document', id);

  const year = document.issuedAt?.getUTCFullYear() ?? new Date().getUTCFullYear();
  const found = await archive.read(
    document.printPath,
    archive.pathFor(code, year, document.number ?? '', 'html'),
  );

  if (found === null) throw archiveUnavailable(entity, id);

  return found.bytes.toString('utf8');
}

/**
 * The archived PDF of an issued Invoice or Credit Note: the bytes a client keeps
 * (ADR 0010), served from the archive rather than re-rendered.
 */
export async function readInvoiceArchive(
  input: ReadInvoicePrintInput,
): Promise<{ pdf: Buffer; sha256: string }> {
  const { prisma, archive, code, id, entity } = input;

  const document = await prisma.document.findFirst({
    where: { id, type: code },
    select: {
      number: true,
      status: true,
      issuedAt: true,
      archivePath: true,
      archiveSha256: true,
    },
  });

  if (!document) throw notFound(entity, id);
  if (document.status !== 'ISSUED') throw notFound('Archived document', id);

  const year = document.issuedAt?.getUTCFullYear() ?? new Date().getUTCFullYear();
  const found = await archive.read(
    document.archivePath,
    archive.pathFor(code, year, document.number ?? ''),
  );

  if (found === null) throw archiveUnavailable(entity, id);

  // A root that moved is the one case where the recorded key is stale; correcting
  // the row keeps the next read from having to search again.
  if (found.path !== document.archivePath) {
    const sha256 = sha256Of(found.bytes);
    await prisma.document.update({
      where: { id },
      data: { archivePath: found.path, archiveSha256: sha256, archivedAt: new Date() },
    });
    return { pdf: found.bytes, sha256 };
  }

  return { pdf: found.bytes, sha256: document.archiveSha256 ?? sha256Of(found.bytes) };
}

/** The hash a client can compare against the row that recorded the file. */
export function sha256Of(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
