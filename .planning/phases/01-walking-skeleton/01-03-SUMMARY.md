---
phase: 01-walking-skeleton
plan: 03
subsystem: ci / deploy
tags: [github-actions, vercel, ci, PIPE-01, PIPE-02, PIPE-04, PIPE-05, PIPE-06]
requires: ["01-01"]
provides:
  - ".github/workflows/collect.yml: hourly + manual collector, serialized, ref main, owner-identity commit, rebase-retry push, inert Deploy Hook fallback"
  - ".github/workflows/ci.yml: typecheck, lint, test, validate:data, build, check:static on code changes (data/** ignored)"
  - "vercel.json: main-only deployments, buildCommand npm run build"
  - "tests/workflows.test.ts: text assertions over both workflows and vercel.json, including a no-expression-in-run: guard"
  - "README.md (PT-BR) with the Operação runbook note"
affects: [01-04, 01-06]
tech-stack:
  added: []
  patterns:
    - "Workflow YAML is asserted as plain text (no YAML dependency); a helper extracts run: bodies (inline and block scalars)"
    - "All dynamic values reach shell steps through env:, never as expressions inside run:"
    - "Secrets are exposed only as step-level env of the step that needs them"
key-files:
  created:
    - .github/workflows/collect.yml
    - .github/workflows/ci.yml
    - vercel.json
    - tests/workflows.test.ts
    - README.md
  modified: []
decisions:
  - "Hand-written commit/push step instead of stefanzweifel/git-auto-commit-action (rebase-retry for PIPE-04, owner author+committer for D-10)"
  - "Commit identity name is 'Thales Guimarães Lopes' (as in D-10 and the plan), email is the owner noreply address"
  - "ITEMS_NEW is re-validated in the shell (non-digits fall back to 0) even though the collector validates it before writing GITHUB_OUTPUT"
metrics:
  duration: "~10 min"
  completed: 2026-10-06
  tasks: 2
  files: 5
---

# Phase 1 Plan 03: Cloud loop workflows + Vercel config Summary

This plan adds the hourly `collect` workflow (cron `17 * * * *` plus dispatch, concurrency group `collect` without cancellation, checkout of `ref: main`, `data/`-only commits authored and committed as the owner noreply identity, and a push that retries up to 3 times with `pull --rebase`), a read-only code `ci` workflow that ends with the static-route guard, a `vercel.json` that deploys only from main, and a text-assertion test suite that locks all of these properties.

## Tasks

| Task | Name | Commits | Files |
| ---- | ---- | ------- | ----- |
| 1 | collect.yml + YAML assertion test | 18e4730 (RED), ccf0751 (GREEN) | tests/workflows.test.ts, .github/workflows/collect.yml |
| 2 | ci.yml, vercel.json, README operations note | 8254956 (RED), 0384aa1 (GREEN) | tests/workflows.test.ts, .github/workflows/ci.yml, vercel.json, README.md |

## Verification

- `npx vitest run tests/workflows.test.ts`: 20 passed. The full suite (`npx vitest run --reporter=dot`): 21 passed.
- `npm run typecheck` and `npm run lint` both exit 0.
- Acceptance greps:
  - The owner email appears exactly 2 times in collect.yml.
  - `force|git-auto-commit|github-actions[bot]` has no matches in collect.yml.
  - `ref: main` and `git add data/` are both present.
  - `paths-ignore` appears exactly 2 times in ci.yml.
  - `pull_request_target|secrets.` has no matches in ci.yml.
  - The vercel.json node check exits 0.
  - The README contains `gh workflow enable collect.yml` and `ai-intelligence-hub-br.vercel.app`.
- The YAML was written only with the Write/Edit tools, because the hook blocks the literal push command in Bash. Nothing was pushed.

## Deviation from CLAUDE.md stack

**Hand-written commit step instead of `stefanzweifel/git-auto-commit-action@v7`.** CLAUDE.md lists both as acceptable alternatives ("Hand-written git add/commit/push step — same result"). The hand-written version was chosen because:

1. **PIPE-04** needs push → `pull --rebase` → retry. The action's README says it "won't handle complex scenarios like rebasing or pulling before pushing".
2. **D-10** requires the owner noreply identity as both the author **and** the committer, because Vercel Hobby checks the committer. Job-level `GIT_AUTHOR_*` / `GIT_COMMITTER_*` env vars do this directly.
3. About 15 lines of shell are easy to audit and keep feed-derived text out of the shell. The commit message uses only the date and an `ITEMS_NEW` value that has been checked to contain digits only.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The ci.yml header comment tripped the plan's own grep/test guards**
- **Found during:** Task 2
- **Issue:** A comment that mentioned `paths-ignore` and "no secrets." made `paths-ignore` match 3 times and matched the `secrets\.` pattern.
- **Fix:** Reworded the comment. The workflow logic is unchanged.
- **Files modified:** .github/workflows/ci.yml
- **Commit:** 0384aa1

### Notes
- The orchestrator prompt described the identity as `thalesguimalopes99 <noreply>`. The plan, D-10 and the local git config all use the name `Thales Guimarães Lopes` with the same noreply email, so I followed the plan. Vercel matches on the email.
- The README tells users to run local collections with `DATA_DIR` set. Plan 01-04 must make `collector/run.ts` honor `DATA_DIR`. The `collect` npm script points to `collector/run.ts`, which plan 01-04 creates, so collect.yml will fail until 01-04 lands. That is expected for wave ordering.

## TDD Gate Compliance

Both tasks have a `test(...)` commit (RED, which failed because the files were missing) followed by a `feat(...)` commit (GREEN).

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. Mitigations applied:
- **T-01-07:** env-only values, enforced by a test.
- **T-01-08:** `pull_request`, `contents: read`, no secrets, enforced by a test.
- **T-01-09:** concurrency without cancel, `ref: main`, rebase-retry, no rewriting of history.
- **T-01-10:** the hook secret is step-level env only, and curl output goes to `/dev/null`.

## Self-Check: PASSED

- All 5 key files exist.
- Commits 18e4730, ccf0751, 8254956 and 0384aa1 are present in `git log`.
