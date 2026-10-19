/**
 * The one shape every archived document is served in: PDF bytes, an
 * `attachment` disposition, and an ETag carrying the archived file's sha256 —
 * the hash the document row records, so a client can tell that the file it
 * holds is the file that was issued.
 */

import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

export interface ArchivedPdf {
  readonly pdf: Buffer;
  readonly sha256: string;
}

export function sendPdf(response: Response, id: string, { pdf, sha256 }: ArchivedPdf): void {
  response.setHeader('Content-Type', 'application/pdf');
  response.setHeader('Content-Length', String(pdf.byteLength));
  response.setHeader('Content-Disposition', `attachment; filename="${id}.pdf"`);
  response.setHeader('ETag', `"${sha256}"`);
  response.status(HttpStatus.OK).send(pdf);
}
