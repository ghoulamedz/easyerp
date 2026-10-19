/**
 * The print-golden helper itself.
 *
 * It exists because a gate's failure message is the product: a comparison that
 * says "these differ" without saying where sends the next person back through the
 * template by hand, and a re-bless path that is not explicit is how a regression
 * becomes a baseline. Both are easy to get subtly wrong, so both are tested.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { comparePrintToGolden } from './print-golden.js';

const HTML = '<!doctype html>\n<html>\n<body>ok</body>\n</html>\n';

describe('comparePrintToGolden', () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'easyerp-print-golden-'));
    delete process.env['UPDATE_GOLDENS'];
  });

  afterEach(() => {
    rmSync(directory, { force: true, recursive: true });
    delete process.env['UPDATE_GOLDENS'];
  });

  it('passes when the print copy matches its golden', () => {
    writeFileSync(join(directory, 'paper.html'), HTML, 'utf8');

    expect(comparePrintToGolden(HTML, 'paper', directory).updated).toBe(false);
  });

  it('refuses a missing golden rather than writing one silently', () => {
    // The alternative — create it on first run — is what makes a "golden" gate
    // bless whatever the code happened to do the first time it ran.
    expect(() => comparePrintToGolden(HTML, 'paper', directory)).toThrow(/No print golden/);
  });

  it('writes the golden when re-blessing is asked for explicitly', () => {
    process.env['UPDATE_GOLDENS'] = '1';

    const result = comparePrintToGolden(HTML, 'paper', directory);

    expect(result.updated).toBe(true);
    expect(readFileSync(join(directory, 'paper.html'), 'utf8')).toBe(HTML);
  });

  it('names the differing line and shows it, instead of only hashes', () => {
    writeFileSync(join(directory, 'paper.html'), '<html>\n<p>19.000 %</p>\n</html>\n', 'utf8');

    let message = '';
    try {
      comparePrintToGolden('<html>\n<p>19,000 %</p>\n</html>\n', 'paper', directory);
    } catch (cause) {
      message = (cause as Error).message;
    }

    expect(message).toContain('first difference at line 2');
    expect(message).toContain('19.000 %');
    expect(message).toContain('19,000 %');
    // The command has to be in the message, or the reader has to go looking.
    expect(message).toContain('UPDATE_GOLDENS=1');
  });

  it('does not call a trailing newline a difference at a line that reads the same', () => {
    writeFileSync(join(directory, 'paper.html'), '<html>\n</html>\n\n', 'utf8');

    expect(() => comparePrintToGolden('<html>\n</html>\n', 'paper', directory)).toThrow(
      /only in trailing bytes/,
    );
  });
});
