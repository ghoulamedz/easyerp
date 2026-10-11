/**
 * HTML to PDF through headless Chromium (ADR 0010).
 *
 * ADR 0010 requires the API to own the PDF so the archived artifact is produced
 * by the same server that owns the numbers. This is that step, and it is the only
 * module in the codebase that touches a browser.
 *
 * ## Why Chromium, and what it costs
 *
 * Arabic needs shaping and bidirectional reordering; Latin digits and an Arabic
 * label mixed in one table cell is the case that a pure-JS PDF library gets wrong
 * and a client notices. Chromium also gives us the same layout engine as the web
 * app, so the CSS logical properties ADR 0009 mandates are the same properties in
 * both places rather than two layout systems to keep in agreement.
 *
 * The costs are real and are paid deliberately rather than by accident:
 *
 * - **A browser on every API host.** Installed by the deploy script, not by a
 *   package postinstall, so CI and production have the same explicit step. Without
 *   it the first invoice raises a missing-executable error.
 * - **Arabic fonts are required.** Chromium silently substitutes a fallback with
 *   different metrics instead of failing. The golden test is what turns that
 *   silent substitution into a visible failure.
 * - **A pinned browser version owns the bytes.** Goldens are re-blessed when it
 *   moves. That is the price of byte-level fidelity and it is recorded in the
 *   gate's re-bless procedure.
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';

/**
 * Passed to `page.evaluate` as an expression rather than a function: the callback
 * runs in the browser, but TypeScript type-checks it against this package's Node
 * libraries, where `document` does not exist. A string expression sidesteps that
 * without widening the API package's lib to `dom`.
 */
const FONTS_READY = 'document.fonts.ready';

export interface PdfRenderOptions {
  /** Defaults to the CSS `@page` box, so the template owns page geometry. */
  readonly preferCssPageSize?: boolean;
  readonly printBackground?: boolean;
}

export class PdfRenderer {
  private constructor(
    private readonly browser: Browser,
    private readonly context: BrowserContext,
  ) {}

  static async start(): Promise<PdfRenderer> {
    const browser = await chromium.launch({
      args: [
        // Without this, glyph rasterisation depends on the host's font settings
        // and the same template yields different bytes on a developer's machine
        // and on a client's VPS. The PDF is compared byte for byte, so the
        // rasteriser has to be pinned too.
        '--font-render-hinting=none',
        '--disable-lcd-text',
      ],
    });

    const context = await browser.newContext();
    return new PdfRenderer(browser, context);
  }

  async toPdf(html: string, options: PdfRenderOptions = {}): Promise<Buffer> {
    const page: Page = await this.context.newPage();

    try {
      await page.setContent(html, { waitUntil: 'load' });
      // `load` does not wait for a webfont to finish loading, and a document that
      // renders in a fallback face then swaps is a document whose golden bytes
      // depend on when the swap happened.
      await page.evaluate(FONTS_READY);

      return Buffer.from(
        await page.pdf({
          preferCSSPageSize: options.preferCssPageSize ?? true,
          printBackground: options.printBackground ?? true,
        }),
      );
    } finally {
      await page.close();
    }
  }

  async close(): Promise<void> {
    await this.context.close();
    await this.browser.close();
  }

  /**
   * Box geometry for one element, in CSS pixels of an A4 page at 96dpi.
   *
   * This exists so the RTL requirement is tested rather than assumed. A document
   * can carry `dir="rtl"` and still lay out left-to-right if the template used a
   * physical property somewhere, and the PDF bytes would then look plausible in
   * every golden. Measuring the inline-start edge is the only thing that catches
   * a mirrored stylesheet creeping back in.
   */
  async measure(html: string, selector: string): Promise<{ x: number; width: number }> {
    const page = await this.context.newPage();

    try {
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluate(FONTS_READY);

      const box = await page.locator(selector).first().boundingBox();
      if (box === null) {
        throw new Error(`No element matched "${selector}" while measuring a document.`);
      }

      return { x: box.x, width: box.width };
    } finally {
      await page.close();
    }
  }
}

let shared: Promise<PdfRenderer> | undefined;

/**
 * One browser per API process, created on first use.
 *
 * Launching Chromium costs hundreds of milliseconds and a browser process per
 * invoice would turn every issue of a document into a browser startup. The first
 * invoice pays it; the rest reuse it.
 */
export function sharedPdfRenderer(): Promise<PdfRenderer> {
  shared ??= PdfRenderer.start();
  return shared;
}

/** For tests and for a clean shutdown; not part of the request path. */
export async function closeSharedPdfRenderer(): Promise<void> {
  const pending = shared;
  shared = undefined;
  await (await pending)?.close();
}
