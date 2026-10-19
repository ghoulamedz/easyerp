/**
 * Serving an archived paper.
 *
 * The regression this file exists for: an Issued document whose archived bytes
 * are missing from the host used to fall back to re-rendering through Chromium.
 * On a deployment without a browser — the serverless one — that launch raised an
 * untyped error, which `DomainExceptionFilter` turns into the opaque
 * `{"error":{"code":"INTERNAL_ERROR","message":"The request could not be completed"}}`
 * a user reported seeing when opening an invoice. The archive is the only render
 * store, so the honest answer is `ARCHIVE_UNAVAILABLE`.
 *
 * The other half is the shape every caller depends on: PDF bytes, an
 * `attachment` disposition, and an ETag carrying the archived file's sha256, so a
 * client can tell that the file it holds is the file that was issued.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DomainError } from '../common/errors.js';
import { sendPdf } from '../common/pdf-response.js';
import { PaperPdfService } from './paper-pdf.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { DocumentArchive } from '../sales/document-archive.js';

const BYTES = Buffer.from('%PDF-1.7 archived bytes');
const SHA = createHash('sha256').update(BYTES).digest('hex');

/** The response surface `sendPdf` touches, and nothing else. */
function fakeResponse() {
  const headers: Record<string, string> = {};
  return {
    headers,
    statusCode: 0,
    body: undefined as Buffer | undefined,
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(body: Buffer) {
      this.body = body;
      return this;
    },
  };
}

function service(
  row: {
    id?: string;
    number?: string | null;
    status?: string;
    archivePath?: string | null;
    archiveSha256?: string | null;
    printPath?: string | null;
    issuedAt?: Date | null;
  },
  archiveRoot: string,
): PaperPdfService {
  const prisma = {
    document: {
      findFirst: async () => ({
        id: row.id ?? 'doc-1',
        number: row.number ?? 'CO-2026-0001',
        status: row.status ?? 'ISSUED',
        issuedAt: row.issuedAt ?? new Date('2026-02-01T12:00:00.000Z'),
        archivePath: row.archivePath === undefined ? null : row.archivePath,
        archiveSha256: row.archiveSha256 ?? null,
        printPath: row.printPath === undefined ? null : row.printPath,
      }),
      update: async () => undefined,
    },
  } as unknown as PrismaService;
  // The real archive over a scratch root: a stub that only answered `pathFor`
  // would pass while the read path it is meant to test never ran.
  return new PaperPdfService(prisma, new DocumentArchive(archiveRoot));
}

describe('sendPdf', () => {
  it('answers PDF bytes with the headers a download needs', () => {
    const response = fakeResponse();

    sendPdf(response as never, 'doc-1', { pdf: BYTES, sha256: SHA });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-length']).toBe(String(BYTES.byteLength));
    expect(response.headers['content-disposition']).toBe('attachment; filename="doc-1.pdf"');
    // The hash is what lets a client prove the file it holds is the issued one.
    expect(response.headers['etag']).toBe(`"${SHA}"`);
    expect(response.body).toBe(BYTES);
  });
});

describe('PaperPdfService.readArchive', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'easyerp-paper-'));
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it('serves the archived bytes and their stored hash', async () => {
    const path = join(root, 'paper.pdf');
    await writeFile(path, BYTES);

    const result = await service({ archivePath: path, archiveSha256: SHA }, root).readArchive(
      'SALES_ORDER',
      'doc-1',
    );

    expect(result.pdf.equals(BYTES)).toBe(true);
    expect(result.sha256).toBe(SHA);
  });

  it('answers ARCHIVE_UNAVAILABLE when the bytes are gone from the host', async () => {
    // This is the regression: the old code re-rendered here, and on a
    // browser-less deployment the Chromium launch escaped as INTERNAL_ERROR.
    const failure = await service({ archivePath: join(root, 'deleted.pdf') }, root)
      .readArchive('SALES_ORDER', 'doc-1')
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(DomainError);
    expect((failure as DomainError).code).toBe('ARCHIVE_UNAVAILABLE');
    // Never the generic body the user could only read as "the request could not be completed".
    expect((failure as DomainError).code).not.toBe('INTERNAL_ERROR');
  });

  it('answers ARCHIVE_UNAVAILABLE when the row records no archive path at all', async () => {
    const failure = await service({ archivePath: null }, root)
      .readArchive('DELIVERY_NOTE', 'doc-2')
      .catch((error: unknown) => error);

    expect((failure as DomainError).code).toBe('ARCHIVE_UNAVAILABLE');
  });

  it('answers NOT_FOUND for a paper that was never issued', async () => {
    // A Draft has no archive and never will: that is a different answer from a
    // deployment that lost the bytes of an issued document.
    const failure = await service({ status: 'DRAFT', archivePath: null }, root)
      .readArchive('SALES_ORDER', 'doc-3')
      .catch((error: unknown) => error);

    expect((failure as DomainError).code).toBe('NOT_FOUND');
  });

  it('does not re-render when the archive is missing', async () => {
    // The renderer is the dependency that made the old fallback explode. If a
    // missing archive ever reaches it again, this assertion names the cause.
    const render = vi.fn();
    vi.doMock('../finance/pdf.js', () => ({ sharedPdfRenderer: render }));

    const failure = await service({ archivePath: join(root, 'gone.pdf') }, root)
      .readArchive('PURCHASE_ORDER', 'doc-4')
      .catch((error: unknown) => error);

    expect((failure as DomainError).code).toBe('ARCHIVE_UNAVAILABLE');
    expect(render).not.toHaveBeenCalled();

    vi.doUnmock('../finance/pdf.js');
  });
});
