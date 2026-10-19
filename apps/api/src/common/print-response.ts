/**
 * The print copy of a Document, served as HTML.
 *
 * The API used to serve only PDFs, which meant only a host with a browser could
 * print: the server rendered HTML and Chromium rasterised it. Serving the HTML
 * instead moves the rasterising to the only browser guaranteed to be present —
 * the visitor's — so printing works on a VPS, in a container and in a serverless
 * function alike, with no browser to install, bundle or launch.
 *
 * The templates carry their own `<style>` with `@page { size: A4 }`, so the paper
 * arrives complete: one response, no subresources, nothing to wait for before
 * `window.print()`.
 */

import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

/**
 * A Content-Security-Policy narrow enough that the response cannot act.
 *
 * `helmet`'s application-wide default is `default-src 'none'`, which would also
 * drop the paper's own stylesheet and leave the client printing unstyled text.
 * So this route restates the policy rather than inheriting it: inline styles are
 * allowed because the stylesheet is inline and is the document, and nothing else
 * is — no scripts, no fetches, no navigation, no form posts. The HTML here is
 * generated from stored columns, never from request input, and a policy that
 * would let it run anything is not needed to display it.
 */
const PRINT_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; " +
  "base-uri 'none'; form-action 'none'; frame-ancestors 'self'";

export function sendPrint(response: Response, id: string, html: string): void {
  const body = Buffer.from(html, 'utf8');

  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Content-Length', String(body.byteLength));
  response.setHeader('Content-Disposition', `inline; filename="${id}.html"`);
  response.setHeader('Content-Security-Policy', PRINT_CSP);
  // The bytes are the document, so a browser must not sniff them into another type.
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.status(HttpStatus.OK).send(body);
}
