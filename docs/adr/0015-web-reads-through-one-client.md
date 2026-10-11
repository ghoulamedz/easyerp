# The web app reads and writes through one client, in client components

Every screen in `apps/web` is a client component fetching through a single typed
`src/lib/api.ts`, and the "is anyone signed in?" check lives once in
`(app)/layout.tsx` — not in Server Components, not in Server Actions, not in Next
middleware, and not in React Query.

The obvious alternative for a Next.js App Router app in 2026 is Server Components
that fetch on the server and Server Actions that mutate. That path was rejected for
three reasons that all point the same way. **Forwarding the session**: a server-side
fetch has to read the request's cookie and replay it against `API_INTERNAL_URL`,
which is plumbing nothing yet needs, because an ERP behind sign-in has no
search-engine audience to render for. **Two patterns**: RSC data fetching plus
Server Actions means every screen has two ways to be written and two ways to be
tested, against a repository whose vitest + jsdom + testing-library setup already
tests client components directly. **Middleware**: Next middleware runs before the
`[locale]` segment exists, so it would have to reconstruct `isLocale` and the locale
prefix that `(app)/layout.tsx` already owns — a second implementation of a rule that
has to stay in one place.

The session gate therefore sits in `(app)/layout.tsx`, the server component that
already validates the locale with `notFound()`: fetch `GET /api/auth/get-session`,
forward `cookie`, `redirect(\`/${locale}/sign-in\`)`when it comes back empty. It
answers exactly one question — *is anyone signed in* — and deliberately nothing
more. "Does this account still have access?" is`SessionGuard`'s answer, on every
API request, which is what makes a deactivated account stop working on its next
request rather than on its next page load.

The wrapper around `fetch` is typed from `packages/contracts` rather than from local
interfaces, turns `DomainError` into an `ApiError { status, code, message }`, maps
`401` to a redirect to sign-in and `403` to a "not permitted" state in the same
`resource:action` vocabulary the Permissions screen renders. Pagination and sort go
in the URL's search params, so a filtered list is bookmarkable and the browser's
back button does the expected thing.

## Consequences

- No new runtime dependency. React Query and SWR were considered and declined: a
  cache invalidation layer is worth having once there is a cache to invalidate, and
  adding one means adding a second test toolchain to prove it.
- Hiding a screen is never the only thing hiding the capability. The layout gate, a
  disabled nav entry and a permission check on a button are all conveniences; the
  API refuses regardless, which is what spec 001 story 20 actually asks for.
- A screen that must render on the server for some future reason has to move
  deliberately, one screen at a time. That is a cost accepted here rather than
  carried everywhere from the first commit.
