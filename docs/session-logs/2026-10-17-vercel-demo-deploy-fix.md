# Session — Vercel demo deployment fix

Date: 2026-10-17

## Done

- Removed explicit `./apps/api` and `./apps/web` paths from all Vercel CLI deploy
  steps in `.github/workflows/deploy-demo.yml`. Each Vercel project already has
  its Root Directory configured, so passing the directory again duplicated it.
- Removed the invalid `runtime: nodejs22` custom runtime from
  `apps/api/vercel.json`. Vercel manages the Node.js runtime; custom runtime
  identifiers require the `package@version` form.
- Updated `docs/deploy-vercel-neon-free.md` to document both deployment details.

## Verified

- The deployment workflow passes Prettier formatting.
- `apps/api/vercel.json` parses as JSON.
- `git diff --check` passes; no deploy command retains an explicit app path and
  the API config has no custom `runtime`.

## Not verified

- A live Vercel deployment was not run; Vercel credentials and project access are
  not available in this session.
- Prettier's combined check also flagged formatting in `apps/api/vercel.json` and
  this deployment guide; those files were not broadly reformatted.
