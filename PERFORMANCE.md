# Performance backlog

Living list of the work not yet done. The full review, with the measurements behind it,
is in `docs/session-logs/2026-10-20-performance-review.md`.

**The constraint that shapes this file:** the demo on Vercel + Neon is production, a
client uses it, and its database will be migrated to a VPS. Anything below marked
*needs a migration* waits for that window. Everything else is a code change with no
schema impact.

Already landed, for context — a five-row order list went from **33 HTTP requests to 3**
(one shared session promise; see `apps/web/src/lib/client-session.ts` and its test).

---

## 1. Delete a `FOR UPDATE` that locks nothing — **not applied, needs your yes**

**Where** `apps/api/src/documents/document-list.service.ts:64` and `:97`

```ts
// list(): after the page was already read
await this.prisma.$queryRaw`SELECT id FROM "document" WHERE id IN (...) FOR UPDATE`;

// find(): before the row it wants
await this.prisma.$queryRaw`SELECT 1 FROM "document" WHERE id = ${id} AND type = ${type} FOR UPDATE`;
```

**Why it is wrong.** Both run **outside any transaction**, so each is its own implicit
transaction: the lock is released when that statement commits, microseconds later, and the
rows have already been read by the query before it. Neither statement's result is used.
The comment says it prevents stale reads; it cannot.

**What it costs.** One extra round trip on every document list and every document read,
and it queues readers behind writers for the length of one statement — on a pooled Neon
connection that is the wrong direction entirely.

**The change.** Delete both statements and their comments. If a stale read ever becomes a
real problem, the answer is a transaction that spans the read and the write that cares
about it, not a lock on a read whose result is thrown away.

**Risk.** None to data or to results: the statements have no observable effect beyond
contention. **This is a two-line deletion and the only reason it is still here is that
removing a lock from a live system should be the operator's decision.**

**How to verify.** `pnpm test:integration` — the document list and detail specs cover both
paths. Watch that no spec depended on row locking (none does; nothing asserted it).

---

## 2. Index `document.number` for search — **needs a migration**

**Where** `apps/api/src/documents/document-list.service.ts:35`

```ts
q ? { number: { contains: parsed.q, mode: 'insensitive' } } : {}
```

**Why.** `contains` becomes `ILIKE '%q%'`, which no btree can answer: every search scans
the whole `document` table. `item.code` has a `gin_trgm_ops` index
(`item_code_trgm_idx`, migration `20261006111950`); `document.number` has none, so the
document lists — the screens with the most rows in practice — are the ones without the
index.

**The change**, in a migration:

```sql
CREATE INDEX IF NOT EXISTS document_number_trgm_idx
  ON "document" USING GIN (("number") gin_trgm_ops);
```

`pg_trgm` is already installed by that earlier migration, so no new extension is needed.

**Risk.** Index creation on a live table takes a lock; use `CREATE INDEX CONCURRENTLY`
outside a transaction block, or create it during the VPS cutover when the app is not
serving.

**How to verify.** `EXPLAIN (ANALYZE)` the list query with a `q` before and after: a
`Seq Scan` becomes a `Bitmap Index Scan`.

---

## 3. Index the sort the list actually uses — **needs a migration**

**Where** `apps/api/src/documents/document-list.service.ts:58` — `orderBy: { createdAt: 'desc' }`

**Why.** The filter is `(type, status?)` and the sort is `createdAt desc`. The existing
indexes are `(businessId, type, status, issuedAt)` and `(type, status)`. Neither covers the
sort, so PostgreSQL reads the matching rows and sorts them in memory. On a page-1 request
that is invisible; deep in a long list it is not.

**The change:**

```sql
CREATE INDEX IF NOT EXISTS document_type_status_createdAt_idx
  ON "document" ("type", "status", "createdAt" DESC);
```

**Also worth reviewing in the same window:** `@@index([businessId, type, status, issuedAt])`
leads with `businessId`, which no query filters on — ADR 0003 removed multi-tenancy, so
there is exactly one Business per deployment. It is wider than it needs to be and does not
serve the hot path. Dropping or narrowing it is a judgement call: confirm no report query
uses it first.

**How to verify.** `EXPLAIN (ANALYZE)` on the list query; look for `Sort` disappearing in
favour of an index scan.

---

## 4. The frame makes two API calls before any page renders — **deliberate, revisit on the VPS**

**Where** `apps/web/src/app/[locale]/(app)/layout.tsx`

`readSetupStatusSafe()` and `readSession()` both run on every navigation. They are now
concurrent and covered by `(app)/loading.tsx`, so the wait is shorter and visible, but it
is still two round trips before anything paints.

**Why it is not changed now.** Caching either answer means deciding how long a revoked
session keeps working, and how a Business that completes Setup stops being redirected to
it. That is the authentication path, which `AGENTS.md` puts out of scope until the
database moves.

**When it becomes worth doing.** After the VPS migration, when the API is next to the
database: at that point the two calls are cheap and this stops mattering, or the session
can be cached in a cookie the layout trusts for one request. Measure before changing.

---

## How to re-measure what was already fixed

The numbers in the review came from a throwaway test, kept as a real gate in
`apps/web/src/lib/client-session.test.tsx`: it renders thirty permission-reading controls
and asserts the page makes **at most two requests**. To see the difference by hand, change
the assertion to print the count and revert the sharing in `client-session.ts` — the same
exercise reports 33 for a five-row list.

Two habits for anything performance-related added later:

- **Count the requests, not the code paths.** The session bug was invisible in review
  because no single file was wrong: `document-actions.tsx` reading permissions is correct,
  and correct twenty-five times is 50 requests.
- **Measure before and after, in a test that fails.** An optimisation whose effect cannot
  be asserted is a hypothesis with a commit message.
