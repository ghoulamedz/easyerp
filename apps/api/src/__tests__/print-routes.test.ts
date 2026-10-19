/**
 * Every print route names its document in the path.
 *
 * The bug this catches is not hypothetical: `@Get('orders/print')` (no `:id`)
 * sat on the Sales Order and Delivery Note controllers, so Nest passed
 * `undefined` as the id and every request asked for the paper of a document
 * that does not exist. It type-checks, it boots, and the only visible symptom
 * is one 404 — which is exactly why it needs a gate rather than a reader.
 *
 * A source scan is the right altitude here. The defect is in the decorator, not
 * in the handler's behaviour, so a test that starts the whole server to hit one
 * route would still pass while a second controller carried the same mistake.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = path.resolve(import.meta.dirname, '..');

/** Every `.controller.ts` under `src/`, wherever the module keeps it. */
function controllerFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'generated') continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...controllerFiles(full));
    } else if (entry.name.endsWith('.controller.ts')) {
      found.push(full);
    }
  }
  return found;
}

/**
 * The route decorator that governs each `@Param('id')` handler.
 *
 * A handler's path is the nearest route decorator above it, so a param with no
 * `:id` in that path is a param Nest can never fill.
 */
function handlersReadingId(source: string): { method: string; route: string }[] {
  const handlers: { method: string; route: string }[] = [];
  const routeDecorator = /@(Get|Post|Patch|Put|Delete)\(\s*'([^']*)'\s*\)/g;
  const routes = [...source.matchAll(routeDecorator)];

  for (const param of source.matchAll(/@Param\('id'\)/g)) {
    const index = param.index ?? 0;
    const governing = routes.filter((route) => (route.index ?? 0) < index).at(-1);
    if (governing === undefined) continue;
    handlers.push({ method: governing[1] ?? '', route: governing[2] ?? '' });
  }
  return handlers;
}

describe('print routes', () => {
  it('finds the controllers it is meant to police', () => {
    // A gate that scans nothing passes silently, which is the failure mode this
    // whole file exists to prevent.
    expect(controllerFiles(SRC).length).toBeGreaterThan(5);
  });

  it('gives every handler that reads a route id a path carrying :id', () => {
    const broken: string[] = [];
    for (const file of controllerFiles(SRC)) {
      for (const handler of handlersReadingId(readFileSync(file, 'utf8'))) {
        if (!handler.route.includes(':id')) {
          broken.push(`${path.relative(SRC, file)}: @${handler.method}('${handler.route}')`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it('declares a /:id/print route for every paper the API can render', () => {
    const sources = controllerFiles(SRC).map((file) => readFileSync(file, 'utf8'));
    const routes = sources.flatMap((source) =>
      [...source.matchAll(/@Get\(\s*'([^']*\/print)'\s*\)/g)].map((match) => match[1] ?? ''),
    );

    // One per renderable paper: Sales Order, Delivery Note, Purchase Order,
    // Goods Receipt, Production Order, Customer Invoice, Credit Note.
    expect(routes).toHaveLength(7);
    expect(routes.every((route) => route.includes(':id'))).toBe(true);
  });
});
