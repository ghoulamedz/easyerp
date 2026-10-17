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
- Added Prisma client generation to Vercel's own build command. The generated
  client is gitignored, so the local workflow build's generated files are not
  available to Vercel's remote build; compiling without regeneration caused the
  reported missing Prisma imports and model properties.
- Updated `docs/deploy-vercel-neon-free.md` to document both deployment details.
- Fixed the subsequent web-build TypeScript failure in nine form tests. They
  typed the mocked `fetch` as `ReturnType<typeof vi.fn>`, which under Vitest 5
  gives `mockImplementation` an unusable callable-or-constructor union. They now
  use Vitest's `Mock` type.

## Verified

- Contracts and API builds, API lint, typecheck, and unit tests pass (57 tests).
- `prisma:generate` followed by the API build succeeds, matching the new Vercel
  build command.
- Web typecheck and production build pass; web unit tests pass (174 tests).
- Web lint completes with eight existing warnings and no errors.
- A local check confirms the configured function file exists and exports the
  compiled handler; `apps/api/vercel.json` parses as JSON.
- Prettier passes for the new function file and deployment workflow. `git diff
  --check` passes.

## Not verified

- A live Vercel build/deployment was not run; Vercel credentials and project
  access are not available in this session.
- The Neon `P1001` is not confirmed fixed. The workflow uses the `demo` branch
  and produces an endpoint hostname different from the one reported on the
  dashboard; verify the selected dashboard branch and `NEON_PROJECT_ID` secret.
- Prettier's combined check still flags existing table/list formatting in the
  deployment guide; it was not broadly reformatted.
