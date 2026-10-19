/**
 * The document archive (ADR 0010).
 *
 * An issued document's filed copies are the paper a client keeps and a tax
 * authority may ask for years later, so they are written outside the database.
 * Two consequences are deliberate:
 *
 * - **It is outside the database backup.** `pg_dump` stays a database backup
 *   rather than becoming a document store, and restoring a database does not
 *   quietly restore or quietly lose documents.
 * - **A write is immutable.** The archive refuses to replace an existing file.
 *   Overwriting a filed invoice would make the "immutable" claim in the ADR a
 *   promise rather than a fact, and the sha256 recorded against the row is what
 *   makes a later swap detectable.
 *
 * ## Two copies, two facts
 *
 * `html` is the print copy: self-contained HTML that every host can produce and
 * that Print serves, so the visitor's own browser does the rasterising. `pdf` is
 * the second copy Chromium files where a browser exists to make one. Keeping
 * both means a browser-less deployment still ends up with a complete, printable
 * document instead of an issue that produced nothing.
 *
 * ## Where the bytes live
 *
 * The bytes go to a *backend*, chosen once at composition:
 *
 * - {@link DiskArchiveBackend} — a directory on the host. Durable on a VPS,
 *   which is where the archive is meant to live; `DOCUMENT_ARCHIVE_ROOT` names it.
 * - {@link BlobArchiveBackend} — Vercel Blob, for a deployment whose filesystem
 *   is ephemeral (`/tmp` on a serverless function is gone by the next request).
 *   Chosen by `BLOB_READ_WRITE_TOKEN` being set, not by asking which platform
 *   this is: a token is a configuration fact, and one that any host could supply.
 *
 * The choice lives in the factory at the composition root. Nothing in a service
 * asks where the bytes are, which is what keeps both deployments on one code path.
 *
 * ## The write/record window
 *
 * Issuing commits the document first, then the files are written, then the row is
 * updated with their keys and hashes. A crash between those steps leaves an
 * issued document with a number and no `archivedAt`, which is visible and
 * recoverable: every figure the paper needs is stored on the row, so it can be
 * rendered again deterministically. Writing the files before committing would
 * instead leave orphans for a document that does not exist — harder to detect,
 * because nothing in the database refers to them.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

import { get, put } from '@vercel/blob';

export class ArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchiveError';
  }
}

/**
 * What a Document is filed as.
 *
 * `html` is the print copy, `pdf` the rasterised one. They are separate files
 * because they are separate facts.
 */
export type ArchiveExtension = 'pdf' | 'html';

export interface ArchivedDocument {
  readonly path: string;
  readonly sha256: string;
  readonly byteLength: number;
}

/** A filed copy, and the key it was actually found under. */
export interface ArchivedCopy {
  readonly path: string;
  readonly bytes: Buffer;
}

/**
 * Reject a document number that could escape the archive.
 *
 * The number reaches a filesystem path and a blob key, and a number containing
 * `../` or an absolute path would write outside the archive. Documents are
 * numbered by the server, so this should be unreachable — which is exactly why it
 * is checked rather than assumed.
 */
function assertContainedNumber(number: string): void {
  if (
    number.length === 0 ||
    number.includes('/') ||
    number.includes('\\') ||
    number.includes('..')
  ) {
    throw new ArchiveError(`Refusing to archive a document numbered "${number}".`);
  }
}

/**
 * Where filed copies are kept.
 *
 * A key is opaque to everything but the backend that produced it: on disk it is
 * an absolute path, in a blob store it is a pathname. Rows store keys, so swapping
 * a backend does not change what a row means — only whether its key resolves.
 */
export interface ArchiveBackend {
  keyFor(code: string, year: number, number: string, extension: ArchiveExtension): string;
  /** Persist `bytes`, refusing to replace what is already there. */
  write(key: string, bytes: Buffer, contentType: string): Promise<void>;
  read(key: string): Promise<Buffer | null>;
  /** Size in bytes, or 0 when there is nothing there. */
  length(key: string): Promise<number>;
}

/**
 * The archive as a directory on this host.
 *
 * `wx` fails when the path exists, which is the immutability guarantee; the
 * containing directory is created on demand so a new year or a new document type
 * needs no provisioning.
 */
export class DiskArchiveBackend implements ArchiveBackend {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  keyFor(code: string, year: number, number: string, extension: ArchiveExtension): string {
    assertContainedNumber(code);
    assertContainedNumber(number);

    const key = join(this.root, code, String(year), `${number}.${extension}`);
    if (!key.startsWith(this.root + sep)) {
      throw new ArchiveError(`Refusing to write outside the archive: ${key}`);
    }

    return key;
  }

  async write(key: string, bytes: Buffer): Promise<void> {
    await mkdir(dirname(key), { recursive: true });

    try {
      await writeFile(key, bytes, { flag: 'wx' });
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new ArchiveError(
          `An archived copy already exists at ${key}. Issued documents are never overwritten; ` +
            'if this is a retry after a partial write, remove the file deliberately.',
        );
      }
      throw cause;
    }
  }

  async read(key: string): Promise<Buffer | null> {
    try {
      return await readFile(key);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw cause;
    }
  }

  async length(key: string): Promise<number> {
    try {
      return (await stat(key)).size;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return 0;
      throw cause;
    }
  }
}

/**
 * The archive as a blob store.
 *
 * Exists because a serverless function's filesystem is not durable: `/tmp` holds
 * one invocation's leftovers and the next request may run somewhere else, so a
 * print copy filed there is a 404 waiting to happen. A blob store is the same
 * archive with the durability a server does not have to provide.
 *
 * `access: 'private'` is not a default to be overridden — these are a Business's
 * invoices. A public blob URL is a bearer token, and one pasted into a chat is a
 * leak that no permission check in the API can undo.
 */
export class BlobArchiveBackend implements ArchiveBackend {
  constructor(
    private readonly token: string,
    private readonly prefix = 'documents',
  ) {}

  keyFor(code: string, year: number, number: string, extension: ArchiveExtension): string {
    assertContainedNumber(code);
    assertContainedNumber(number);

    return `${this.prefix}/${code}/${year}/${number}.${extension}`;
  }

  async write(key: string, bytes: Buffer, contentType: string): Promise<void> {
    try {
      await put(key, bytes, {
        access: 'private',
        contentType,
        token: this.token,
        // The pathname is the document number, the way the disk backend's path is
        // — a random suffix would make a row's key unreproducible — and an
        // existing blob is a collision to surface, not a file to replace.
        addRandomSuffix: false,
        allowOverwrite: false,
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new ArchiveError(
        `Refusing to overwrite a filed document at ${key}: ${message}. Issued documents are ` +
          'never overwritten; if this is a retry after a partial write, remove the blob deliberately.',
      );
    }
  }

  async read(key: string): Promise<Buffer | null> {
    const result = await get(key, { access: 'private', token: this.token });
    if (result === null) return null;

    return Buffer.from(await new Response(result.stream).arrayBuffer());
  }

  async length(key: string): Promise<number> {
    try {
      const result = await get(key, { access: 'private', token: this.token });
      if (result === null) return 0;

      // The SDK types `size` as nullable; an unstated size is not a size.
      return result.blob.size ?? 0;
    } catch {
      // A missing blob answers 404, which the SDK surfaces as a throw. Size is
      // only ever used for a display figure, so absent reads as absent.
      return 0;
    }
  }
}

const CONTENT_TYPES: Record<ArchiveExtension, string> = {
  pdf: 'application/pdf',
  html: 'text/html; charset=utf-8',
};

export class DocumentArchive {
  private readonly backend: ArchiveBackend;

  /** A string is a directory on this host, which is what every caller but the factory wants. */
  constructor(backend: string | ArchiveBackend) {
    this.backend = typeof backend === 'string' ? new DiskArchiveBackend(backend) : backend;
  }

  /** The key a document of this code, year and number is filed under. */
  pathFor(code: string, year: number, number: string, extension: ArchiveExtension = 'pdf'): string {
    return this.backend.keyFor(code, year, number, extension);
  }

  async store(
    code: string,
    year: number,
    number: string,
    bytes: Buffer,
    extension: ArchiveExtension = 'pdf',
  ): Promise<ArchivedDocument> {
    const path = this.pathFor(code, year, number, extension);
    await this.backend.write(path, bytes, CONTENT_TYPES[extension]);

    return {
      path,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      byteLength: bytes.byteLength,
    };
  }

  /**
   * Read a filed copy, trying the key recorded on the row and then the key the
   * current configuration implies.
   *
   * The second attempt exists for one real case: the archive root moved, so every
   * row now names a directory that no longer exists while the files sit at the
   * same relative position under the new root. Without it, moving the archive
   * would make every historical document unreadable and the only fix would be a
   * bulk SQL update.
   *
   * Returns `null` — not an error — when the copy is absent from both places. That
   * is a state a Draft and the issue-before-write window are legitimately in, and
   * the caller knows which typed answer to give: `NOT_FOUND` for a document that
   * was never issued, `ARCHIVE_UNAVAILABLE` for one that was.
   */
  async read(storedKey: string | null, expectedKey: string): Promise<ArchivedCopy | null> {
    const keys =
      storedKey !== null && storedKey === expectedKey ? [storedKey] : [storedKey, expectedKey];

    for (const key of keys) {
      if (key === null) continue;

      const bytes = await this.backend.read(key);
      if (bytes !== null) return { path: key, bytes };
    }

    return null;
  }

  /**
   * Size of a filed copy, for the API response.
   *
   * Asks the backend rather than trusting a stored length: a length column that
   * disagrees with the file is worse than no column. Returns 0 when there is no
   * archive.
   */
  async byteLengthOf(path: string | null): Promise<number> {
    if (path === null) return 0;
    return this.backend.length(path);
  }
}

/**
 * The archive this deployment is configured for.
 *
 * A Blob token means the filesystem is not trusted to keep what is filed there;
 * without one, the archive is the directory named by `DOCUMENT_ARCHIVE_ROOT`.
 * The decision is made from configuration and nothing else, so both deployments
 * run the same services and no code below this line knows which one it is on.
 */
export function archiveFromConfig(config: {
  readonly DOCUMENT_ARCHIVE_ROOT: string;
  readonly BLOB_READ_WRITE_TOKEN?: string | undefined;
}): DocumentArchive {
  if (config.BLOB_READ_WRITE_TOKEN !== undefined) {
    return new DocumentArchive(new BlobArchiveBackend(config.BLOB_READ_WRITE_TOKEN));
  }

  return new DocumentArchive(config.DOCUMENT_ARCHIVE_ROOT);
}
