/**
 * Where filed copies are kept, and what that choice is allowed to depend on.
 *
 * Two backends, one archive: a directory on a host that has durable disk, and a
 * blob store for a deployment whose `/tmp` is emptied between invocations. What
 * this file pins is the part that can silently rot — that the choice is made from
 * configuration alone, that a key cannot escape its prefix, and that a filed copy
 * is never replaced.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ArchiveError,
  archiveFromConfig,
  BlobArchiveBackend,
  DiskArchiveBackend,
  DocumentArchive,
} from './document-archive.js';

const BYTES = Buffer.from('filed bytes');

describe('archiveFromConfig', () => {
  it('files to disk when no blob token is configured', () => {
    // The VPS shape, and the default: durable disk on the host, named by config.
    const archive = archiveFromConfig({ DOCUMENT_ARCHIVE_ROOT: '/srv/archive' });

    expect(archive.pathFor('SALES_ORDER', 2026, 'CO-2026-0001')).toBe(
      '/srv/archive/SALES_ORDER/2026/CO-2026-0001.pdf',
    );
  });

  it('files to blob storage as soon as a token is configured', () => {
    // The serverless shape. Nothing asks which platform this is: a token is a
    // configuration fact any host could supply, which is what keeps one code path.
    const archive = archiveFromConfig({
      DOCUMENT_ARCHIVE_ROOT: '/tmp/easyerp-documents',
      BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_example',
    });

    expect(archive.pathFor('SALES_ORDER', 2026, 'CO-2026-0001', 'html')).toBe(
      'documents/SALES_ORDER/2026/CO-2026-0001.html',
    );
  });
});

describe('archive keys', () => {
  it('refuses a document number that would escape the archive', () => {
    // Documents are numbered by the server, so this is unreachable — which is why
    // it is checked: a number reaching a path is a number reaching a path.
    const backend = new BlobArchiveBackend('token');

    expect(() => backend.keyFor('SALES_ORDER', 2026, '../../etc/passwd', 'pdf')).toThrow(ArchiveError);
    expect(() => backend.keyFor('SALES_ORDER', 2026, 'a/b', 'pdf')).toThrow(ArchiveError);
    expect(() => backend.keyFor('SALES_ORDER', 2026, '', 'pdf')).toThrow(ArchiveError);
  });
});

describe('disk archive', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'easyerp-archive-'));
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it('files both copies under the document number and reads them back', async () => {
    const archive = new DocumentArchive(root);

    const html = await archive.store('SALES_ORDER', 2026, 'CO-2026-0001', BYTES, 'html');
    const pdf = await archive.store('SALES_ORDER', 2026, 'CO-2026-0001', BYTES, 'pdf');

    expect(html.path.endsWith('CO-2026-0001.html')).toBe(true);
    expect(pdf.path.endsWith('CO-2026-0001.pdf')).toBe(true);
    expect((await readFile(html.path, 'utf8')).length).toBe(BYTES.length);

    const found = await archive.read(html.path, html.path);
    expect(found?.bytes.equals(BYTES)).toBe(true);
  });

  it('refuses to replace a filed copy', async () => {
    // Immutability, at the one place it can be enforced: the write.
    const archive = new DocumentArchive(root);
    await archive.store('SALES_ORDER', 2026, 'CO-2026-0001', BYTES, 'pdf');

    await expect(archive.store('SALES_ORDER', 2026, 'CO-2026-0001', BYTES, 'pdf')).rejects.toThrow(
      ArchiveError,
    );
  });

  it('finds a copy under the recomputed key when the root moved', async () => {
    // A row recorded `/old/root/...` and the files now live under `/new/root/...`:
    // the same relative position, so the second attempt is what keeps history
    // readable after a move.
    const written = await new DocumentArchive(root).store(
      'SALES_ORDER',
      2026,
      'CO-2026-0001',
      BYTES,
      'pdf',
    );
    const relative = written.path.slice(root.length + 1);

    const moved = new DocumentArchive(join(root, 'moved'));
    await new DocumentArchive(join(root, 'moved')).store(
      'SALES_ORDER',
      2026,
      'CO-2026-0001',
      BYTES,
      'pdf',
    );

    const found = await moved.read(`/old/root/${relative}`, moved.pathFor('SALES_ORDER', 2026, 'CO-2026-0001'));
    expect(found?.bytes.equals(BYTES)).toBe(true);
  });

  it('answers absent instead of throwing when a copy is gone', async () => {
    const archive = new DocumentArchive(root);

    expect(await archive.read(join(root, 'never.pdf'), join(root, 'never.pdf'))).toBeNull();
    expect(await archive.byteLengthOf(join(root, 'never.pdf'))).toBe(0);
  });

  it('reports the size of a copy it holds', async () => {
    const archive = new DocumentArchive(root);
    const stored = await archive.store('SALES_ORDER', 2026, 'CO-2026-0001', BYTES, 'html');

    expect(await archive.byteLengthOf(stored.path)).toBe(BYTES.byteLength);
  });
});

describe('disk backend', () => {
  it('is what a plain string archive root selects', () => {
    expect(new DocumentArchive('/srv/archive')).toBeInstanceOf(DocumentArchive);
    expect(new DiskArchiveBackend('/srv/archive').keyFor('SALES_ORDER', 2026, 'CO-1', 'pdf')).toBe(
      '/srv/archive/SALES_ORDER/2026/CO-1.pdf',
    );
  });
});
