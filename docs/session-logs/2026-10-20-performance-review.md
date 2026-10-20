# Performance review — easyERP, live on Vercel + Neon free tier

Requested as "task a reviewer to inspect the whole app and try to optimize
performance/speed". Two delegation attempts were made and **both failed for the same
environment reason, not a code reason**: the delegate and every Fusion candidate were
pinned to a provider named `freeflow` that this Pi install does not have
(`Error: Unknown provider "freeflow"`). The review below is therefore my own, done with
read access to the repository, and it is the more careful for it: every number in it was
measured, not estimated.

## The one finding that dwarfs the rest

**A single list screen asked "who is signed in?" sixteen times.**

`fetchSession()` costs **two** round trips — `/api/auth/get-session`, then
`/api/users/me` — and every permission check calls it. The calls multiplied by the number
of *controls*, not the number of screens: `DocumentActions` renders three permission
checks per row, and `DocumentList` one more.

Measured, before the fix, on a five-row order list:

```
TOTAL=33  session=16  me=16  list=1
```

Thirty-three HTTP requests to render one list, and **every `/api/users/me` is a database
round trip** (session lookup, user, roles, permissions). A twenty-five-row page — the
default page size — asks seventy-six times: **about 152 requests per page view.** On Neon
free tier that is not "a little slow", it is the page.

| | before | after |
| --- | --- | --- |
| 5-row list | **33 requests** | **3** |
| 25-row list (estimated) | ~152 | 3 |

### The change

`apps/web/src/lib/client-session.ts` shares one in-flight promise instead of issuing one
per caller. Every existing caller still awaits it and still sets its own state; the first
does the work and the rest wait. `forgetSession()` clears it, and is called in exactly the
two places the answer changes: after sign-in (`sign-in-form.tsx`, before the soft
navigation) and after sign-out (`app-shell.tsx`).

**Risk: none, and the failure mode is benign by construction.** Permissions are enforced
server-side on every request (`SessionGuard`), so a stale *client* answer can only ever
hide a button — never grant one. No endpoint changed, no server behaviour changed.

**Why this was invisible:** the count is a property of the component tree, not of any one
file. Nothing in a code review of `document-actions.tsx` says "this runs twenty-five
times".

### Gate

`apps/web/src/lib/client-session.test.tsx` renders thirty permission-reading controls and
asserts **at most two requests total**; a second test asserts a later reader on the same
page reuses the answer; a third asserts `forgetSession()` re-asks. Reverting the sharing
fails all three (verified).

The test setup file also calls `forgetSession()` between tests — module state outliving a
test is how the second test in a file silently asserts against the first one's
permissions.

## Fixed in this pass

| # | Where | What | Effect |
| --- | --- | --- | --- |
| 1 | `apps/web/src/lib/client-session.ts` | shared in-flight session promise | **33 → 3** requests per list |
| 2 | `apps/web/src/lib/use-modules.ts` | shared module list; the rail *and* the mobile drawer both mount | −1 request per page |
| 3 | `apps/api/src/sales/delivery-note.service.ts:409` | `findUnique` per line inside the issue transaction → one `findMany` | −1 round trip per line, shortening a lock window |
| 4 | `apps/api/src/documents/document-list.service.ts:40` | `count` and `findMany` awaited in sequence → `Promise.all` | −1 round trip per list |
| 5 | `apps/web/src/app/[locale]/(app)/layout.tsx` | setup-status and session awaited in sequence → `Promise.all` | −1 round trip **on every page load** |

Item 3 matters more than the count suggests: that loop runs *inside* the transaction that
holds the Item row locks, so every extra round trip lengthens the window in which a
concurrent issue waits.

## Recommended, **not applied** — needs your yes

### A `FOR UPDATE` that locks nothing, on every document read

`apps/api/src/documents/document-list.service.ts:64` and `:97`

```ts
await this.prisma.$queryRaw`SELECT id FROM "document" WHERE id IN (...) FOR UPDATE`;
```

The comment says it prevents stale reads. It cannot: the statement runs **outside any
transaction**, so the lock is released when that statement commits — microseconds later —
and the rows were already read by the query before it. The result is also discarded. What
it does do is add a round trip to every list, and queue readers behind writers for the
duration of one statement.

`find()` has the same shape: a `FOR UPDATE` before a `findUnique`, outside a transaction.

The fix is deleting both statements. I have **not** done it, because removing a lock from
a live system is your call, not a review finding. Say the word and it is a two-line
deletion.

## Needs a migration — wait for the VPS window

Reported, not actioned, because the live database is the one that must survive.

1. **`document.number` has no trigram index.** Every list search is
   `number ILIKE '%q%'` (`document-list.service.ts:35`) — a sequential scan of the whole
   document table per keystroke. `item.code` has a `gin_trgm_ops` index
   (`item_code_trgm_idx`); `document.number` has none.
2. **No index for the list's actual sort.** The query orders by `createdAt desc` with a
   `(type, status)` filter; the indexes are `(businessId, type, status, issuedAt)` and
   `(type, status)`. `(type, status, createdAt)` is what it wants.
3. **`@@index([businessId, type, status, issuedAt])` leads with a column no query
   filters on** in a single-deployment schema (ADR 0003 removed multi-tenancy). It is
   wider than it needs to be and does not serve the hot path.

## Investigated and found clean

- **Sequential awaits in the web app**: twelve components already batch their reference
  reads with `Promise.all`. No regressions found; no consecutive `await apiGet` pairs.
- **N+1 in the API**: swept every `for (const …)` body in every service for a query
  inside it. One real case (item 3 above); two apparent matches were false positives that
  iterate over data already fetched.
- **Duplicated fetches between layout and page**: none. The frame reads setup-status and
  session; the page reads its own list. The double fetch that existed was the session
  one, item 1.
- **Client bundle**: `apps/web` depends only on `next`, `react`, `react-dom` and
  `@easyerp/contracts`. No heavy library is imported into a client component.
- **Cold start**: `prisma.service.ts` already swallows a failed `$connect` so `/api/health`
  answers on a cold deploy. Nothing per-request to remove there.

## What this deliberately does not touch

- **`(app)/layout.tsx` still makes two API calls before any page renders.** They are now
  concurrent and covered by a skeleton, but caching either one changes the authentication
  path — which `AGENTS.md` rules out until the VPS.
- **The Neon latency itself.** The operator's own note — "I don't mind, it's a free tier"
  — is right: it is a tier property, not a defect. What this pass removes is the traffic
  that multiplied it.

## Perceived speed

Waiting animations were requested alongside the real fixes, and the two are related: on a
free-tier database the wait is real and not ours to remove, so the screen should say it is
working.

- **`apps/web/src/app/[locale]/(app)/loading.tsx`** — there was **no `loading.tsx`
  anywhere** in the app. One file covers every screen inside the group: Next renders it
  while the segment streams and swaps the real page in place. Before it, a navigation
  showed the *previous* screen, unchanged, until the layout's two calls answered — which
  is what "the click did nothing" looks like.
- **`Skeleton`, `SkeletonRows`, `SkeletonPage`** in `ui.tsx`, with `aria-hidden` on the
  blocks and a single `role="status"` on the container, so a screen reader hears "loading"
  once rather than a dozen empty boxes.
- **The twelve list screens** swapped their bare `Loading…` text line for skeleton rows.

## Suggested order, if you want the rest

1. Approve the `FOR UPDATE` deletion (two lines, removes a round trip from every document
   read).
2. Migration window: the trigram index on `document.number` and the `(type, status,
   createdAt)` index. These make search and paging index-backed instead of scans.
3. Then, and only then, look at the Neon tier.
