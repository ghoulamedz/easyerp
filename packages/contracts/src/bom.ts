/**
 * Bill of Materials and its versions (spec 002 stories 85–86).
 *
 * A BOM names the component Items and their quantities for one unit of a
 * finished Item. A version is immutable and dated; a Production Order holds a
 * `bomVersionId` and never joins to "the latest".
 */

import { z } from 'zod';
import { quantitySchema } from './numeric.js';

/** One line of a BOM version. */
export const bomVersionLineSchema = z.object({
  itemId: z.string().min(1),
  quantity: quantitySchema,
  unitOfMeasureId: z.string().min(1),
});
export type BomVersionLine = z.infer<typeof bomVersionLineSchema>;

/** A BOM version as served. */
export const bomVersionSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  lines: z.array(bomVersionLineSchema),
});
export type BomVersion = z.infer<typeof bomVersionSchema>;

/** What a client submits when creating a BOM version. */
export const createBomVersionSchema = z.strictObject({
  bomId: z.string().min(1),
  lines: z.array(bomVersionLineSchema).min(1),
});
export type CreateBomVersion = z.infer<typeof createBomVersionSchema>;

/** A BOM as served. */
export const bomSchema = z.object({
  id: z.string().min(1),
  finishedItemId: z.string().min(1),
  versions: z.array(bomVersionSchema),
  createdAt: z.string().datetime(),
});
export type Bom = z.infer<typeof bomSchema>;

/** A BOM as a list row: finished-item identity plus version signal, never lines. */
export const bomSummarySchema = z.object({
  id: z.string().min(1),
  finishedItemId: z.string().min(1),
  finishedItemCode: z.string().min(1).max(64),
  finishedItemName: z.string().min(1).max(255),
  versionCount: z.number().int().nonnegative(),
  latestVersion: z.number().int().positive().nullable(),
  createdAt: z.string().datetime(),
});
export type BomSummary = z.infer<typeof bomSummarySchema>;

/** What a client submits when creating a BOM. */
export const createBomSchema = z.strictObject({
  finishedItemId: z.string().min(1),
});
export type CreateBom = z.infer<typeof createBomSchema>;