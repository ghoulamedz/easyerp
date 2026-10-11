/**
 * The document archive (ADR 0010).
 *
 * An issued document's PDF is the copy a client keeps and a tax authority may
 * ask for years later, so it is written to the host's disk and never to the
 * database. Two consequences are deliberate:
 *
 * - **It is outside the database backup.** `pg_dump` stays a database backup
 *   rather than becoming a document store, and restoring a database does not
 *   quietly restore or quietly lose documents.
 * - **A write is immutable.** The archive opens the target with `wx`, which fails
 *   if the file exists. Overwriting a filed invoice would make the "immutable"
 *   claim in the ADR a promise rather than a fact, and the sha256 recorded against
 *   the row is what makes a later swap detectable.
 *
 * ## The write/record window
 *
 * Issuing commits the document first, then the PDF is written, then the row is
 * updated with the archive's path and hash. A crash between those steps leaves an
 * issued document with a number and no `archivedAt`, which is visible and
 * recoverable: every figure the PDF needs is stored on the row, so the document
 * can be rendered again deterministically. Writing the PDF before committing would
 * instead leave an orphaned file for a document that does not exist — harder to
 * detect, because nothing in the database refers to it.
 */

import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

export class ArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchiveError';
  }
}

export interface ArchivedDocument {
  readonly path: string;
  readonly sha256: string;
  readonly byteLength: number;
}

/**
 * Reject a document number that could escape the archive directory.
 *
 * The number reaches a filesystem path, and a number containing `../` or an
 * absolute path would write outside the archive. Documents are numbered by the
 * server, so this should be unreachable — which is exactly why it is checked
 * rather than assumed.
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

export class DocumentArchive {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  /** `<root>/<code>/<year>/<number>.pdf`, created on demand. */
  pathFor(code: string, year: number, number: string): string {
    assertContainedNumber(code);
    assertContainedNumber(number);

    return join(this.root, code, String(year), `${number}.pdf`);
  }

  async store(code: string, year: number, number: string, pdf: Buffer): Promise<ArchivedDocument> {
    const path = this.pathFor(code, year, number);
    const containing = dirname(path);

    if (!path.startsWith(this.root + sep)) {
      throw new ArchiveError(`Refusing to write outside the archive: ${path}`);
    }

    await mkdir(containing, { recursive: true });

    try {
      // `wx` fails when the path exists. An issued document is never re-archived
      // over, so a collision means either a duplicate number or a retry after a
      // half-finished write, and both warrant a human.
      await writeFile(path, pdf, { flag: 'wx' });
    } catch (cause) {
      const errno = (cause as NodeJS.ErrnoException).code;
      if (errno === 'EEXIST') {
        throw new ArchiveError(
          `An archived PDF already exists at ${path}. Issued documents are never overwritten; ` +
            'if this is a retry after a partial write, remove the file deliberately.',
        );
      }
      throw cause;
    }

    return {
      path,
      sha256: createHash('sha256').update(pdf).digest('hex'),
      byteLength: pdf.byteLength,
    };
  }

  /**
   * Size of an archived document, for the API response.
   *
   * Reads the file rather than trusting a stored length: a length column that
   * disagrees with the file is worse than no column, and the answer costs one
   * `stat`. Returns 0 when there is no archive, which is the state a Draft and the
   * issue-before-write window are both in.
   */
  async byteLengthOf(path: string | null): Promise<number> {
    if (path === null) return 0;

    try {
      return (await stat(path)).size;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return 0;
      throw cause;
    }
  }
}
