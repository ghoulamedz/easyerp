# Slice 2 (Settings): the Administrator's own surface

Second vertical slice of the expansion (spec 001 stories 8–24), the sibling of
`2026-10-06-setup-slice.md`. Adds the Settings domain — Business profile, Tax
Rates, Units, Number patterns, Terminology labels, the Module switch — and the
users/roles HTTP surface, all behind the existing permission catalog. Everything
a Settings write does is audited.

## What was done

- `packages/contracts/src/settings.ts` + `settings.test.ts`: `businessProfileSchema`,
  `taxRateRecordSchema`, `unitRecordSchema`, `numberPatternRecordSchema`,
  `labelRecordSchema`, `moduleStateSchema` and builders. Exported from `index.ts`.
  62 tests.
- OpenAPI: registered the six schemas and the paths (`/settings/business` GET/PATCH,
  `/settings/tax-rates` GET/POST, `/settings/units` GET, `/settings/number-patterns`
  GET, `/settings/modules` GET, `/settings/labels` PUT). Array responses are
  `z.array(schema)` — a plain `{ type: 'array', items: ZodObject }` literal is not
  assignable to the `registerPath` response type.
- `ModuleState` model in `schema.prisma` + migration `20261006120000_module_state`
  (applied to both databases via `pnpm db:migrate:all`). Added to
  `ops/src/tables.ts` CRITICAL_TABLES and to the harness `resetDatabase()`.
  Setup now provisions one explicit `isEnabled` row per Module (absent = enabled
  stays the safe default per ADR 0012); Setup's numbering defaults moved into
  `DEFAULT_PATTERNS` in `document-numbering.service.ts` (all seven Document types)
  and are imported, not duplicated.
- `apps/api/src/settings/`: `module-state.service.ts` + `modules.guard.ts`
  (`@RequiresModule('FINANCE')`, a `ModulesGuard` APP_GUARD between SessionGuard and
  PermissionsGuard so the honest 403 refusal precedes permission checks),
  `business.service.ts`, `tax-rate.service.ts` (calendar dates, `assertDates`, **no
  DELETE**), `unit.service.ts`, `number-pattern.service.ts`, `label.service.ts`
  (empty value deletes the override, `forDocument(locale)` feeds the invoice render
  path), one `settings.controller.ts`, `settings.module.ts`.
- Identity HTTP surface: `users.service.ts::create` (better-auth/crypto hash,
  email-conflict, role-existence, one transaction), `users.controller.ts`,
  `roles.controller.ts` (permits `roles:create`/`roles:update`/`roles:delete`),
  `identity.module.ts` now carrying both controllers.

## Strongest findings

1. **Every session 401'd because `isActive` never reached the session-role mapper.**
   Better Auth's session output only carries mapped user fields; our `isActive`
   column was invisible, so `toSessionUser`'s `candidate.isActive !== true` check
   nulled every session and the SessionGuard 401'd — a production bug that only an
   authenticated route could surface, which is why the identity unit suite (which
   calls services directly) never saw it. Fix: declare `isActive` as a
   `user.additionalFields` entry with `input: false` in `better-auth.provider.ts`,
   so it is read back into the session output but unsettable by the sign-up form.
2. **Mistaking `body.token` for the session cookie.** The sign-in JSON body carries
   the raw session token; the browser cookie is that token **signed** by
   `setSignedCookie`. `getSetCookie()` returns `[]` on this Node/fetch (the header
   node is a single string), so the spec reads `headers.get('set-cookie')` instead
   and echoes the first `name=value` segment — the exact bytes a browser sends back.
   Table when debugging: `are you signed in?` → check `auth.api.getSession({headers})`
   against the DB row, because the last sign-in success is not the failure point.
3. Nest's serializer omits a handler's returned `null`, leaving an empty 200 body —
   unusable as a "override deleted" signal. The labels PUT handler writes
   `res.json(result)` explicitly (`@Res({ passthrough: true })`).
4. The last-administrator rule is not "you can't deactivate an admin"; it is "deactivate
   and leave NO active administrator". A second administrator deactivates freely; the
   caller's own account is protected by its own check. The integration test pins both.

## Gate runs

- `pnpm --filter @easyerp/contracts test` — 62 passed; typecheck, build clean.
- `pnpm --filter @easyerp/api test` — 41 passed; typecheck, lint clean.
- `pnpm test:integration` — **65 passed** (14 from this spec: profile patch + audit,
  tax-rate create/retire/no-delete, unit create, 7 patterns listed and set, label
  override upsert/delete, module off → FINANCE refused → re-enabled → admitted,
  modules list, user creation + self-deactivation refused, unknown-role 404,
  unknown-permission 422).
- `pnpm verify` — 15/15 tasks green.
- `pnpm test:golden` — green (render path now consults label overrides; default text
  unchanged).
- `pnpm format:check` — clean (after `pnpm format`).
- `ops` — 29 passed.

## Unresolved / next

- Web Settings UI (permission-gated forms), the users/roles React surface, and
  module-aware navigation are a later slice; nothing here needs them.
- `/settings/labels` GET honours `?entityType` only; a `?locale` filter is deferred.
- Number-pattern `PUT` overwrites pattern+padding; history lives in the audit trail,
  not in the number-pattern table — revisit only if a precedent for pattern history
  emerges from the numbering spec.
