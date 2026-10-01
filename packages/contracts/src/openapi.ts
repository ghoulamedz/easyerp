/**
 * The OpenAPI document is generated from the same Zod schemas the API validates
 * with, so a request shape can never drift between the runtime contract and the
 * published one. Route modules register their own paths against `registry`.
 */

import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { documentSchema } from './documents.js';
import { itemSchema, partySchema } from './catalog.js';
import { healthSchema } from './health.js';
import { roleSchema, sessionUserSchema, userSchema } from './identity.js';
import { permissionSchema } from './permissions.js';
import { stockPositionSchema } from './stock.js';

/** The generated document's own type, taken from the generator rather than restated. */
export type OpenApiDocument = ReturnType<OpenApiGeneratorV31['generateDocument']>;

export const registry = new OpenAPIRegistry();

registry.register('SessionUser', sessionUserSchema);
registry.register('User', userSchema);
registry.register('Role', roleSchema);
registry.register('Permission', permissionSchema);
registry.register('Item', itemSchema);
registry.register('Party', partySchema);
registry.register('Document', documentSchema);
registry.register('StockPosition', stockPositionSchema);

registry.registerPath({
  method: 'get',
  path: '/health',
  summary: 'Liveness. Answers as long as the process is running.',
  responses: {
    200: { description: 'Alive.', content: { 'application/json': { schema: healthSchema } } },
  },
});

registry.registerPath({
  method: 'get',
  path: '/ready',
  summary: 'Readiness. Fails until the database answers, so a rollout waits for migrations.',
  responses: {
    200: { description: 'Ready.', content: { 'application/json': { schema: healthSchema } } },
    503: { description: 'Not ready.', content: { 'application/json': { schema: healthSchema } } },
  },
});

export function generateOpenApiDocument(title = 'easyERP API'): OpenApiDocument {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title,
      version: '0.0.0',
      description:
        'Per-Business ERP API. Money and quantities are exact decimal strings, never JSON numbers: a document number is assigned at issue and never reassigned, and stock changes only by appending to the ledger.',
    },
    servers: [{ url: '/' }],
  });
}
