/**
 * Liveness and readiness payloads. Schema-only, so the API does not have to load
 * the OpenAPI generator just to answer a health check.
 */

import { z } from 'zod';

export const healthSchema = z.object({
  status: z
    .enum(['ok', 'degraded'])
    .describe('`degraded` means the process is up but a dependency is not.'),
  checks: z.record(z.string(), z.enum(['ok', 'failing'])).default({}),
});

export type Health = z.infer<typeof healthSchema>;
