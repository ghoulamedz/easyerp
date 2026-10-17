# Session — Vercel demo deployment fix

Date: 2026-10-17

## Done

- Removed explicit `./apps/api` and `./apps/web` paths from all Vercel CLI deploy
  steps in `.github/workflows/deploy-demo.yml`. Each Vercel project already has
  its Root Directory configured, so passing the directory again duplicated it.
- Removed the invalid `runtime: nodejs22` custom runtime from
  `apps/api/vercel.json`. Vercel manages the Node.js runtime; custom runtime
  identifiers require the `package@version` form.
- Fixed the follow-up `unused_function` error: Vercel only discovers function
  entries under `api/`, while the config pointed at `dist/`. Added
  `apps/api/api/index.js` as a thin forwarder to the existing compiled
  `dist/main.serverless.js`, configured it as the function, and routed `/api/*`
  requests to it.
- Updated `docs/deploy-vercel-neon-free.md` to document both deployment details.

## Verified

- Contracts and API builds, API lint, typecheck, and unit tests pass (57 tests).
- A local check confirms the configured function file exists and exports the
  compiled handler; `apps/api/vercel.json` parses as JSON.
- Prettier passes for the new function file and deployment workflow. `git diff
  --check` passes.

## Not verified

- A live Vercel build/deployment was not run; Vercel credentials and project
  access are not available in this session.
- Prettier's combined check flagged pre-existing formatting in
  `apps/api/vercel.json` and this deployment guide; those files were not broadly
  reformatted.
