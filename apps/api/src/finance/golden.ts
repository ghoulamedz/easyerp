/**
 * Comparing a rendered PDF against a committed golden.
 *
 * Chromium's PDF output is deterministic apart from one thing: Skia stamps the
 * wall clock into `/CreationDate` and `/ModDate`. Everything else — the content
 * stream, the embedded font subset, every text position — is stable for a given
 * browser build, which is what makes a byte comparison meaningful and what makes
 * the gate able to catch a one-pixel layout drift.
 *
 * Two bytes move between two renders of the same template. Rather than weaken the
 * comparison to text extraction, the two timestamps are normalised. The
 * normalisation is *assertive*: if it does not find exactly the fields it expects,
 * it throws, because a silent no-op here would leave the comparison comparing two
 * differently-stamped files and reporting a diff that looks like a layout change.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Goldens live beside the test that owns them. The path is resolved from the
 * working directory rather than from `import.meta.url`, because the API compiles
 * to CommonJS (`tsconfig.json` sets `"module": "commonjs"`) and `import.meta` is
 * a syntax error there. Vitest runs with the package root as its working
 * directory, and Turbo invokes it from that package, so the resolution holds.
 */
export const GOLDEN_DIR = join(process.cwd(), 'src', 'finance', '__tests__', 'goldens');

/** A fixed instant, so the normalisation is idempotent across re-blesses. */
const FIXED_INSTANT = "D:19700101000000+00'00'";

const SKIA_TIMESTAMPS = /(\/(?:Creation|Mod)Date) \(D:[^)]*\)/g;

export class PdfNotNormalisableError extends Error {
  constructor(found: number) {
    super(
      `Expected to normalise 2 Skia timestamps (/CreationDate and /ModDate) but matched ${found}. ` +
        'The browser either stopped writing them or started writing them differently; a byte ' +
        'comparison is not meaningful until this is understood.',
    );
    this.name = 'PdfNotNormalisableError';
  }
}

/**
 * Replace the render time with a fixed instant. Throws unless it found exactly the
 * two fields, so a change in the producer's output surfaces here with a cause
 * instead of as a mysterious byte mismatch.
 */
export function normalisePdfTimestamps(pdf: Buffer): Buffer {
  let found = 0;

  const normalised = pdf.toString('latin1').replace(SKIA_TIMESTAMPS, (_match, key: string) => {
    found += 1;
    return `${key} (${FIXED_INSTANT})`;
  });

  if (found !== 2) {
    throw new PdfNotNormalisableError(found);
  }

  return Buffer.from(normalised, 'latin1');
}

export function hashPdf(pdf: Buffer): string {
  return createHash('sha256').update(pdf).digest('hex');
}

export interface GoldenComparison {
  readonly name: string;
  readonly path: string;
  readonly updated: boolean;
}

/**
 * Compare a rendered document to its golden, or write it when re-blessing.
 *
 * The failure message names the two hashes and the exact command to accept the
 * change, because the useful question on a failing gate is "did I intend this?"
 */
export function compareToGolden(pdf: Buffer, name: string): GoldenComparison {
  const path = join(GOLDEN_DIR, `${name}.pdf`);
  const actual = normalisePdfTimestamps(pdf);

  if (process.env['UPDATE_GOLDENS'] === '1') {
    mkdirSync(GOLDEN_DIR, { recursive: true });
    writeFileSync(path, actual);
    return { name, path, updated: true };
  }

  let expected: Buffer;
  try {
    expected = readFileSync(path);
  } catch {
    throw new Error(
      `No golden for "${name}" at ${path}. Create it deliberately and read the result:\n` +
        '  pnpm test:golden -- --update',
    );
  }

  if (!expected.equals(actual)) {
    throw new Error(
      `Document "${name}" differs from its golden.\n` +
        `  expected sha256 ${hashPdf(expected)}\n` +
        `  actual   sha256 ${hashPdf(actual)}\n` +
        'If the change is intended:\n' +
        '  pnpm test:golden -- --update\n' +
        'then read the diff. A re-bless nobody read is how a regression becomes the baseline.',
    );
  }

  return { name, path, updated: false };
}
