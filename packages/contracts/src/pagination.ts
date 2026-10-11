/**
 * Offset pagination (expansion decisions Q10).
 *
 * Controllers that return a collection that can outgrow a screen return an
 * envelope, never a bare array: the web app needs `total` to render a paginator,
 * and a hard page-size cap keeps one unprotected query from becoming a full table
 * scan of the Business's data. The legacy application returned unpaged
 * collections, which is the defect the envelope answers.
 *
 * The query is parsed from the URL string, so `page` and `pageSize` coerce from
 * their transport form; a request that cannot be read as a page of positive
 * integers is a validation failure, not a silent default.
 */

import { z } from 'zod';

export const PAGE_SIZE_MAX = 100;
export const PAGE_SIZE_DEFAULT = 25;

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
  /** Free-text search against the collection's own fields. */
  q: z.string().trim().max(255).optional(),
});
export type PageQuery = z.infer<typeof pageQuerySchema>;

/** The wire shape of a paged collection. The concrete item schema is the caller's. */
export function paginatedSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(PAGE_SIZE_MAX),
  });
}
