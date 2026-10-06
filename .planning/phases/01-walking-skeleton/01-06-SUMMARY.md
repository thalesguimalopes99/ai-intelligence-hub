---
phase: 01-walking-skeleton
plan: 06
subsystem: infra
tags: [github, vercel, deploy, ci, identity-guard]
requires: ["01-03", "01-04", "01-05"]
provides: ["Public personal repo thalesguimalopes99/ai-intelligence-hub", "Vercel project ai-intelligence-hub-br (Git-connected, main-only) serving the empty-state site at https://ai-intelligence-hub-br.vercel.app", "PIPE-03 first leg: push to main -> green CI + READY production deployment"]
affects: [vercel.json, tests/workflows.test.ts, .vercel/project.json (gitignored)]
tech-stack:
  added: []
  patterns: ["explicit framework preset in vercel.json (CLI-created projects default to framework null)", "identity guard before any account-scoped CLI action (gh login+id, vercel whoami, git email)"]
key-files:
  created: [.vercel/project.json (local, gitignored)]
  modified: [vercel.json, tests/workflows.test.ts]
decisions:
  - "vercel.json pins \"framework\": \"nextjs\" because `vercel project add` created the project with framework null; locked by a test in tests/workflows.test.ts"
  - "Vercel project name is ai-intelligence-hub-br (domain ai-intelligence-hub-br.vercel.app) because ai-intelligence-hub.vercel.app is taken"
  - "The user accepted that .planning/ and CLAUDE.md are public in the repo"
metrics:
  duration: ~1 session (Task 3 verification ~5 min)
  completed: 2026-10-06
  tasks: 3
  files: 2
requirements: [PIPE-05, PIPE-03]
---

# Phase 1 Plan 06: Public repo, Vercel project and first live deploy Summary

The public personal repo thalesguimalopes99/ai-intelligence-hub and the personal Vercel project ai-intelligence-hub-br were created through the CLIs after a hard identity guard. The project is Git-connected with main-only deploys. @devops pushed main (d21bf1f), the first ci.yml run passed, and the first production deployment (built as Next.js and running build-views) serves the empty-state page at https://ai-intelligence-hub-br.vercel.app.

## Tasks

| Task | Name | Commit | Notes |
|------|------|--------|-------|
| 1 | Pre-flight, identity guard, create repo and Vercel project (no push) | d21bf1f | Full local suite green; repo + project created; git connect OK |
| 2 | Owner confirms Vercel login connection; @devops pushes main | — (human/@devops) | Login Connection for GitHub thalesguimalopes99 confirmed; origin/main = d21bf1fc6bc68242a3ba12eb4f7d4a1c20e729b8 |
| 3 | Verify first CI run and first production deployment | — (verification only) | All acceptance criteria met |

## Task 1 record

- `gh api user`: thalesguimalopes99 215318905
- `vercel whoami`: thalesguimalopes99
- `git config user.email`: 215318905+thalesguimalopes99@users.noreply.github.com
- Repo: thalesguimalopes99/ai-intelligence-hub, PUBLIC, remote origin
- Vercel project: ai-intelligence-hub-br (prj_nag4kB7rACJkv6q2RPzSVc7s9ne1, team_oC2LAhluZcncL0qqKtSAvpli, scope thalesguimalopes99s-projects, Node 24.x)
- `vercel git connect`: OK, productionBranch main
- Production domain: ai-intelligence-hub-br.vercel.app (verified)
- `.vercel/` is gitignored and not tracked; no Sem Fronteiras account involved anywhere

## Task 3 verification (2026-10-06)

- ci.yml run 37471228906 on d21bf1fc6bc68242a3ba12eb4f7d4a1c20e729b8: **success** (`gh run watch --exit-status` exited 0)
- `gh workflow list`: `ci` active, `collect` active. The collect workflow has zero runs (it was not triggered; plan 01-07 is the probe).
- GitHub deployments API: Production deployment for d21bf1fc6bc68242a3ba12eb4f7d4a1c20e729b8
- `vercel ls --prod`: https://ai-intelligence-hub-a1dt5fmu7-thalesguimalopes99s-projects.vercel.app, **Ready**, Production, 40 s, user thalesguimalopes99
- Build log: `Detected Next.js version: 16.3.8`, `Running "npm run build"`, `> tsx scripts/build-views.ts && next build`, `build-views: wrote public/data/meta.json (lastSuccessAt=null)`, `▲ Next.js 16.3.8 (Turbopack)`, `✓ Compiled successfully`. This confirms the framework preset fix from deviation 1 took effect.
- `curl -fsS https://ai-intelligence-hub-br.vercel.app/data/meta.json` returned `{"schemaVersion":1,"lastRunAt":null,"lastSuccessAt":null,"lastRunStatus":null}`. The JSON-parse check `lastSuccessAt === null` exited 0.
- `curl -fsS https://ai-intelligence-hub-br.vercel.app/` returned HTTP 200, and the HTML contains "AI Intelligence Hub", "verificando" and "Nenhuma notícia por aqui ainda".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Vercel project created with framework null**
- **Found during:** Task 1
- **Issue:** `vercel project add` created the project without a framework preset. A deploy would then have been treated as a static "Other" project instead of Next.js.
- **Fix:** Added `"framework": "nextjs"` to vercel.json and a test asserting it in tests/workflows.test.ts.
- **Files modified:** vercel.json, tests/workflows.test.ts
- **Commit:** d21bf1f
- **Verified in Task 3:** the deploy log shows "Detected Next.js version: 16.3.8".

**2. [Rule 3 - Housekeeping] `vercel link` side effects**
- `vercel link` appended entries to .gitignore. These were reverted because .vercel and .env* were already ignored.
- It also created a gitignored `.env.local` containing VERCEL_OIDC_TOKEN, which stays untracked locally.

## Auth gates

- Task 2 (planned human-action checkpoint): the owner confirmed the Vercel Login Connection for GitHub thalesguimalopes99 and authorized the push. The orchestrator pushed as @devops.

## Known Stubs

None introduced by this plan. The empty state (lastSuccessAt null, no items) is the expected pre-collector state, and plans 01-07/01-08 populate it.

## Self-Check: PASSED

- FOUND: .vercel/project.json (gitignored)
- FOUND: commit d21bf1f (local main = origin/main)
- FOUND: ci.yml run 37471228906 success; Vercel production deployment Ready for d21bf1f
