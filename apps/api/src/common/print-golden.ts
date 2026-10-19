/**
 * Comparing a rendered print copy against a committed golden.
 *
 * The print copy is HTML — the bytes `GET <paper>/:id/print` serves and the
 * browser prints — so the golden is a committed `.html` file and the comparison
 * needs no browser, no font package and no PDF writer. Three things follow, and
 * all three are the reason this exists:
 *
 * - **It runs in `pnpm verify`.** The fast gate now covers what a document looks
 *   like, so a changed table header or a lost FODEC row is caught on the commit
 *   that causes it rather than by the browser gate someone has to remember to run.
 * - **A failure is readable.** A byte-diff of a PDF says "these differ"; a line
 *   diff of HTML says `- 19,000 %` / `+ 19.000 %`, which is the difference
 *   between knowing what broke and re-deriving it.
 * - **It is a statement about content and markup**, not about pixels. Actual
 *   pagination and Arabic glyph shaping are the browser gate's job
 *   (`*.golden.spec.ts`, `pnpm test:golden`); this one says the document is the
 *   document.
 *
 * Like the PDF goldens, re-blessing is explicit (`UPDATE_GOLDENS=1`) and the
 * failure message names the command, because the useful question on a red gate is
 * "did I intend this?".
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Goldens live beside the tests that own them, resolved from the working
 * directory: the API compiles to CommonJS, so `import.meta.url` is a syntax error
 * there, and Vitest runs with the package root as its working directory.
 */
export const PRINT_GOLDEN_DIR = join(process.cwd(), 'src', '__tests__', 'goldens', 'print');

export interface PrintGoldenComparison {
  readonly name: string;
  readonly path: string;
  readonly updated: boolean;
}

/** The first line that differs, and its neighbours, so the diff reads like a diff. */
function firstDifference(expected: string, actual: string): string {
  const left = expected.split('\n');
  const right = actual.split('\n');

  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    // A missing line and an empty one are both "nothing here": without that, a
    // file whose only difference is a trailing newline would report a difference
    // at a line that reads identically on both sides.
    if ((left[index] ?? '') !== (right[index] ?? '')) {
      const around = (lines: readonly string[], at: number): string =>
        lines
          .slice(Math.max(0, at - 1), at + 2)
          .map((line, offset) => `    ${String(Math.max(1, at) + offset).padStart(4)} | ${line}`)
          .join('\n');

      return (
        `first difference at line ${index + 1} of ${left.length} / ${right.length}\n` +
        `  expected:\n${around(left, index)}\n` +
        `  actual:\n${around(right, index)}`
      );
    }
  }

  return 'the files differ only in trailing bytes (line endings or a final newline)';
}

/**
 * Compare a print copy to its golden, or write it when re-blessing.
 *
 * `directory` is a seam for the helper's own test; every caller wants the default.
 */
export function comparePrintToGolden(
  html: string,
  name: string,
  directory: string = PRINT_GOLDEN_DIR,
): PrintGoldenComparison {
  const path = join(directory, `${name}.html`);

  if (process.env['UPDATE_GOLDENS'] === '1') {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, html, 'utf8');
    return { name, path, updated: true };
  }

  let expected: string;
  try {
    expected = readFileSync(path, 'utf8');
  } catch {
    throw new Error(
      `No print golden for "${name}" at ${path}. Create it deliberately and read the result:\n` +
        '  UPDATE_GOLDENS=1 pnpm --filter @easyerp/api test\n' +
        'then read the added file. It is the document, so it is worth reading.',
    );
  }

  if (expected !== html) {
    throw new Error(
      `Print copy "${name}" differs from its golden (${path}).\n${firstDifference(expected, html)}\n` +
        'If the change is intended:\n' +
        '  UPDATE_GOLDENS=1 pnpm --filter @easyerp/api test\n' +
        'then read the diff. A re-bless nobody read is how a regression becomes the baseline.',
    );
  }

  return { name, path, updated: false };
}
