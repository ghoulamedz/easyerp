# 2026-10-04 — Document numbers now honour the stored padding

## What was done

`renderDocumentNumber()` produced unpadded numbers, so `FA-{year}-{seq}` with the
stored `padding` of 4 rendered `FA-2026-1` instead of `FA-2026-0001`. The column
existed, the contracts comment promised the behaviour, and a test pinned the
opposite. It is fixed test-first in `packages/contracts`.

- `packages/contracts/src/documents.test.ts` — the numbering tests now pass the
  padding explicitly and assert zero-padding. Two tests were added: one proves the
  stored padding drives the width (the same pattern at padding 2 and 6 renders
  `FA-07` and `FA-000007`), and one proves an invalid padding is refused instead of
  silently rendering unpadded.
- `packages/contracts/src/documents.ts` — `DocumentNumberInput` gained a required
  `padding`, and the renderer pads to it.

The old line was `const width = Math.max(1, String(sequence).length)` followed by
`padStart(width, '0')`: padding a number to its own natural width is a no-op, so
the zero-pad could never appear no matter what the caller passed. The fix is
`padStart(padding, '0')`, which also keeps the existing overflow guarantee — a
sequence that outgrows its padding keeps all its digits (`FA-1000` at padding 4),
so two numbers in one series can never collide.

`padding` is required rather than defaulted on purpose. A default is what let the
stored value be ignored in the first place; making the caller supply the value read
from the `number_pattern` row is the only shape in which that cannot recur silently.

## Strongest findings

- **The defect was a no-op disguised as an implementation.** `padStart` was called
  with a width derived from the number being padded, which looks like padding in a
  diff and behaves like nothing at all. Reading the line for what it computes,
  rather than for what it is called, is what found it.
- **`padStart` never truncates, so the overflow test was already correct.** The test
  asserting `FA-1000`/`FA-1001` stayed green through the change; it guards against a
  future `slice(-padding)` from silently collapsing a series. It is worth keeping a
  test that does not change colour when the behaviour around it is corrected.
- **An invalid padding needed a guard of its own.** `String(1).padStart(0, '0')` and
  `padStart(NaN, '0')` both return `'1'` rather than throwing, so a bad value from
  Settings would have degraded back into exactly the unpadded output this change
  removes, with no error anywhere. The renderer now refuses it the same way it
  refuses a non-positive sequence.

## Verification

Run in `/home/medo/Desktop/easyerp`, Node `v24.21.0`:

| Gate                               | Command                                                | Result                                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Failing first                      | `pnpm --filter @easyerp/contracts test` before the fix | 3 failed, 28 passed — `expected 'FA-2026-1' to be 'FA-2026-0001'`, `expected 'FA-7' to be 'FA-07'`, and `expected function to throw an error, but it didn't` |
| Unit tests                         | `pnpm --filter @easyerp/contracts test`                | 31 passed                                                                                                                                                    |
| Lint, typecheck, unit tests, build | `pnpm verify`                                          | 15/15 tasks                                                                                                                                                  |
| Formatting                         | `pnpm format:check`                                    | clean                                                                                                                                                        |

The three failures above are the proof the tests can fail: each names the missing
behaviour rather than a refactor artefact.

**Not rerun for this change:** `pnpm test:integration` and
`pnpm --filter @easyerp/web test:e2e`. Neither exercises `renderDocumentNumber()` —
it has no caller outside the contracts package — and both were green against this
tree earlier today. They are not evidence for this change.

## Artifacts written

- `packages/contracts/src/documents.ts`
- `packages/contracts/src/documents.test.ts`
- `docs/session-logs/2026-10-04-document-number-padding.md`

## Unresolved

- `docs/specs/001-first-business-and-core-slice.md:153` and `:254` still read as an
  open "Fix required" item, and `:193` still lists the `custom_record.values` GIN
  index as missing. The padding item is now false and should be struck when the
  spec's status is next revised — left alone here because whether that document is
  the amendable implementation contract is still an open question (Q1).
- No caller passes the stored `padding` yet. Setup does not exist, so nothing writes
  a `number_pattern` row or reads one back. The renderer is correct and unused; the
  defect will be closed end to end when the Settings slice reads the row and passes
  `padding` through.
- `number_pattern.padding` has no upper bound anywhere. A `padding` in the millions
  renders a correspondingly long string. It is bounded in practice by an
  Administrator editing it in Settings, which is not built.

## Next steps

1. Add `provisionedVersion`, `vatRegime` and `currency` to `Business`, and the
   `custom_record.values` GIN index, as one verified Prisma migration.
2. Write the document golden test across 3 locales and both VAT regimes.
3. Neon and Vercel deployment, both still blocked on authentication.
