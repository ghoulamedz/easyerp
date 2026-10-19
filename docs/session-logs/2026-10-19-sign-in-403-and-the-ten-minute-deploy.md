# 2026-10-19 — The 403 at sign-in was a stale pointer, not CORS, and the deploy took two of everything

## The symptom

Sign-in on the stable Web domain (`https://easyerp-web.vercel.app`) answered
`403 {"message":"Invalid origin","code":"INVALID_ORIGIN"}`. The error text is Better
Auth's, but the list it measures against is `CORS_ORIGINS`, so it reads as a CORS
misconfiguration. It was not one.

## The evidence, in the order it was gathered

Probing the same request on both sides is what separated the two:

| Request | Result |
| --- | --- |
| `POST https://easyerp-api-three.vercel.app/api/auth/sign-in/email`, `Origin: https://easyerp-web.vercel.app` | **401** `INVALID_EMAIL_OR_PASSWORD` |
| same, `Origin: https://evil.example.com` | 403 `INVALID_ORIGIN` |
| `POST https://easyerp-web.vercel.app/api/auth/sign-in/email`, `Origin: https://easyerp-web.vercel.app` | **403** `INVALID_ORIGIN` |
| `POST https://easyerp-web.vercel.app/api/auth/sign-in/email`, `Origin: https://evil.example.com` | 403 `INVALID_ORIGIN` |
| `GET <both>/api/sales/invoices/anything/pdf` (a route deleted hours earlier) | 404 on both |

So: the API's own domain **trusts** the Web origin, and the API the Web *proxies to*
trusts nothing — while running the same code (the deleted route is absent on both). Two
different deployments, one of them carrying a trust list that rejects every origin.

## Root cause

`deploy-demo.yml` deployed everything **twice** and pointed the Web at the wrong copy.
In order:

1. `vercel-env-pre` wrote `CORS_ORIGINS=https://placeholder.invalid` on the API project
   to make a first deploy possible.
2. `deploy-api` deployed — **deployment A**, built with the placeholder.
3. `deploy-web` set the Web's `API_INTERNAL_URL` to **A's per-deployment hostname**,
   taken from `vercel ls`, and deployed the Web.
4. `vercel-env-final` rewrote `CORS_ORIGINS`/`BETTER_AUTH_URL` on the API project with
   the real Web origin.
5. `redeploy` deployed the API again — **deployment B**, correct environment — and the
   Web again, still pointing at A.

A Vercel deployment's environment is fixed when it is created. So the browser called the
Web, the Web rewrote `/api/*` to deployment **A**, and A rejected `https://easyerp-web.vercel.app`
because its `CORS_ORIGINS` had been `https://placeholder.invalid` since step 1. The stable
API domain worked for the same reason in reverse: it aliases B.

Both halves of the bug are the same mistake — **per-deployment hostnames used as
configuration**. `vercel deploy --prod` mints a new hostname every run, and the workflow
used them for two things that outlive a deployment: the trust list and the proxy target.

## The fix

One deploy per project, stable origins only, no placeholder:

- `deploy-demo.yml` is now two jobs. `neon-db` (unchanged) plus `deploy`, which resolves
  **both projects' stable production domains from the Vercel API before deploying
  anything** (`.targets.production.alias[0]`, else a production-targeted custom domain,
  else `<project>.vercel.app` — and fails the job if it can find none).
- Each project's environment is written **exactly once, before its only deploy**:
  `BETTER_AUTH_URL`/`CORS_ORIGINS` = the Web's stable domain, `API_INTERNAL_URL` = the
  API's stable domain. The placeholder dance is gone, so there is no window in which a
  broken build is serving.
- `env.ts` now refuses to start in production when `BETTER_AUTH_URL` or `CORS_ORIGINS`
  names a reserved host (`.invalid`, `.example`, `.test` — RFC 2606, resolvable for
  nobody). The placeholder could not have shipped if this guard had existed; the next
  equivalent mistake fails the deploy instead of the login.
- A **smoke test** asserts the thing that was broken, with no credentials: through the
  Web origin, `POST /api/auth/sign-in/email` must answer something that proves Better Auth
  handled it — 401 for wrong credentials, 400/422 for the body, 429 for rate limiting. It
  fails on 403 `INVALID_ORIGIN`, on 404 (the Web proxy is not serving the route at all,
  which is why the allowlist is explicit rather than "any 4xx"), and on 000/5xx after a
  retry window. A 403 does not retry: it is a configuration fact, not a rollout race.

## The runtime

The old shape was four jobs of duplicated work: 4 × `pnpm install`, 4 local builds that
Vercel then rebuilt on its own builders (`vercel.json` defines `buildCommand` in both
projects), 2 API deploys and 2 Web deploys. Ten minutes. The new shape is 1 job, 0 local
installs, 0 local builds, 1 deploy each — the deployments themselves are the only
unavoidable cost.

## Not verified here

The workflow's new steps have not been executed (no Vercel token locally). What *is*
verified: the YAML parses, every `run:` block passes `bash -n`, the `jq` origin selector
was run against six response shapes including `{}` (which now fails the job instead of
deploying to a guess), and the `env.ts` guard has nine unit tests. The first real proof is
the next workflow run, whose smoke test is designed to fail loudly if any of this is
wrong.

## Next

- Re-run the workflow (push or `gh workflow run deploy-demo.yml`) to rewrite the live
  projects' environment and repoint the Web at the API's stable domain.
- Both workflows' changes are uncommitted: `.github/workflows/ci.yml` (e2e job restored
  after being deleted by accident, plus `fonts-noto-core`), `.github/workflows/deploy-demo.yml`,
  `apps/api/src/config/env.ts` + its new test, and the deploy doc.
