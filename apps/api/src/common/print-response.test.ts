/**
 * Serving the print copy.
 *
 * Printing used to be a PDF-only affair, which meant a host without a browser
 * could not print at all. The print copy is HTML served with headers that make it
 * displayable and inert: the paper's own stylesheet must survive, and nothing else
 * about the response may be able to act.
 */

import { describe, expect, it } from 'vitest';

import { sendPrint } from '../common/print-response.js';

const HTML = '<!doctype html><html><head><style>@page{size:A4}</style></head><body>x</body></html>';

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

describe('sendPrint', () => {
  it('answers HTML inline, encoded as UTF-8 so Arabic renders', () => {
    const response = fakeResponse();

    sendPrint(response as never, 'doc-1', HTML);

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
    // `inline`, not `attachment`: the browser must display it so it can print it.
    expect(response.headers['content-disposition']).toBe('inline; filename="doc-1.html"');
    expect(response.headers['content-length']).toBe(String(Buffer.byteLength(HTML, 'utf8')));
    expect(response.body?.toString('utf8')).toBe(HTML);
  });

  it('allows the paper’s own inline stylesheet and forbids everything else', () => {
    const response = fakeResponse();

    sendPrint(response as never, 'doc-1', HTML);

    const csp = response.headers['content-security-policy'];
    // Without this the inherited `default-src 'none'` strips the stylesheet and
    // the client prints unstyled text.
    expect(csp).toContain("style-src 'unsafe-inline'");
    // Nothing else may run: the document is data, not an application.
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain('script-src');
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
  });

  it('keeps the declared type from being sniffed into something else', () => {
    const response = fakeResponse();

    sendPrint(response as never, 'doc-1', HTML);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('carries no ETag, because a print copy is not the archival artifact', () => {
    const response = fakeResponse();

    sendPrint(response as never, 'doc-1', HTML);

    expect(response.headers['etag']).toBeUndefined();
  });
});
