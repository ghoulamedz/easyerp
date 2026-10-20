# 2026-10-20 (fourth) — a live deployment, and the waiting it does

The demo now has a client using it as production, and its database will be migrated to a
VPS. So this session opened with a boundary rather than a feature: `AGENTS.md` gained a
section that says no schema changes, no breaking API changes, no expensive
architectural work, extreme care, and no commit or push until told. Everything below is
additive or local.

## Setup: the field that matters, said out loud

The form asked for **two** emails — a business contact address and the administrator's —
and neither said what it was for. The business one prints nowhere, is editable from
Settings afterwards, and is optional in the contract, so it was the redundant one and it
is gone. What is left is the login.

The administrator block is now framed and highlighted, with the name full width and
**email and password side by side**, each carrying its own line: *this email is used for
login*, *this password is used for login*. These are the two fields a person must not
mistype — a wrong one means the administrator they just created cannot sign in, and the
only way back is a database edit. Everything else on the form is editable afterwards.

Translated in all three locales, and gated by `setup-screen.test.tsx`: one email field,
not two; both login hints present; `autocomplete="username"` on the email.

## The button that came back too early

> "when I click a button (login, create…) it greys out a little but returns clickable
> before the next page"

Every form cleared its busy flag in a `finally`, which runs as soon as the request
resolves — *while* `router.push` is still navigating. So the button re-enabled in the gap,
and a second click posted a second document.

The fix is one line per form and the same line in twenty-one of them: clear the flag only
on the failure path, because on success the screen is leaving. `sign-in-form.tsx` has a
different shape (an early `return` for a refused password) and was done by hand.

Gated in `sales-order-unified.test.tsx`: after clicking Create the button must be
*disabled*, and the test mocks `router.push` so nothing navigates away. Restoring the
`finally` fails it (verified).

## Back, everywhere, from one place

Fifty-eight screens render `PageHeader`, so the control went there rather than into
fifty-eight pages.

The destination is **not** `router.back()`. History is whatever the visitor happened to
do: from a search result, a bookmark or a shared link, back would leave the app or land
somewhere unrelated. A screen's parent is a fact about the app, so `parentOf` derives it
from the path — same answer however they arrived.

The rule is "walk up until you reach a screen that lists things", against a list of the
real list routes. That distinction is not segment-counting: `/purchasing/receipts/<id>`
goes to `/purchasing/receipts`, while `/purchasing/orders/<id>/edit` goes to
`/purchasing`, because there is no `/purchasing/orders` page. `/invoices/<id>` is aliased
to `/customer-invoices`, where the list that owns it lives.

`navigation.test.ts` walks the app directory for `page.tsx` files and requires every
route's parent to be a page that exists — so a route added without a parent fails there
instead of shipping a back button that 404s. The dashboard passes `hideBack`, because
back lands on it.

Dialogs already had their exit: the stock adjustment dialog has Cancel, the mobile drawer
has Close. Nothing to add.

## Waiting, which is not the same as speed

There was **no `loading.tsx` anywhere** in the app. The frame's layout awaits two API
calls before it can render — the setup status and the session — so a navigation showed
the previous screen, unchanged, until both answered. On a free-tier database that pause is
long enough to read as "the click did nothing".

- `apps/web/src/app/[locale]/(app)/loading.tsx` — one file, every screen inside the
  group. Next renders it while the segment streams and replaces it in place.
- `Skeleton`, `SkeletonRows`, `SkeletonPage` in `ui.tsx`, carrying `aria-hidden` on the
  blocks and one `role="status"` on the container, so a screen reader hears "loading"
  once rather than a dozen empty boxes.
- The twelve list screens swapped their bare `Loading…` line for `SkeletonRows`.

The reviewer's deeper findings on query counts and re-fetches are in the Fusion report
that follows this log.

## Gates

| Command | Result |
| --- | --- |
| `pnpm verify --force` | 16/16, lint **0 errors** |
| `pnpm test:integration` | 12 files, 155 passed |
| web unit | 34 files, **216 passed** (was 202) |
| `pnpm --filter @easyerp/web test:e2e` | 13 passed |
| mutation checks | button-stays-disabled (1), and the route-parent gate over every page |

The database was reset for the e2e run, which needs one with no Business in it.

## Left alone on purpose

- `apps/web/src/app/[locale]/(app)/layout.tsx` awaits two API calls per request. Caching
  the session or the setup status would change the authentication path — exactly what the
  new `AGENTS.md` section rules out — so it is reported, not touched.
- Indexes the hot queries would want are reported for the migration window, not added.
