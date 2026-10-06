---
phase: 01-walking-skeleton
plan: 01
subsystem: toolchain / site shell
tags: [nextjs, typescript, tailwind, eslint, vitest, static, PIPE-06]
requires: []
provides:
  - "Next 16.3.8 + React 19.3 + TS 6.0.3 + Tailwind 4.3.3 + ESLint 9 + Vitest 5 + tsx toolchain at repo root"
  - "package.json scripts: dev, build (build-views && next build), start, lint, typecheck, test, collect, validate:data, check:static"
  - "Static PT-BR dark `/` shell with UI-SPEC tokens (globals.css @theme) and live-pulse animation token"
  - "Two-layer static guard: dynamic='error' in root layout + scripts/check-static.ts"
affects: [01-02, 01-03, 01-04, 01-05, 01-06, 01-07, 01-08]
tech-stack:
  added: [next@16.3.8, react@19.3.0, react-dom@19.3.0, zod@4.6.5, date-fns@4.4.0, "@date-fns/tz@1.5.0", lucide-react@1.52.0, typescript@6.0.3, "@types/node@^24", tailwindcss@4.3.3, "@tailwindcss/postcss@4.3.3", eslint@9.39.5, eslint-config-next@16.3.8, tsx@4.23.15, vitest@5.0.3, feedsmith@3.0.1, ky@2.1.0, normalize-url@9.0.1]
  patterns:
    - "Scaffold via create-next-app in scratchpad, copy only selected files (CLAUDE.md protected)"
    - "AGENTS.md carries Next's managed agent-rules block"
    - "typecheck = next typegen && tsc --noEmit (route-type globals exist on a clean clone)"
key-files:
  created:
    - package.json
    - package-lock.json
    - tsconfig.json
    - next.config.ts
    - next-env.d.ts
    - postcss.config.mjs
    - eslint.config.mjs
    - vitest.config.ts
    - .nvmrc
    - .gitattributes
    - AGENTS.md
    - tests/smoke.test.ts
    - src/app/layout.tsx
    - src/app/page.tsx
    - src/app/globals.css
    - scripts/check-static.ts
    - scripts/build-views.ts
  modified:
    - .gitignore
decisions:
  - "ESLint pinned to ^9.39.5 (not 10.12.0 from CLAUDE.md): ESLint 10 crashes eslint-config-next 16.3.8 (RESEARCH Pitfall 3)"
  - "typecheck script runs `next typegen` before `tsc --noEmit` so the scaffold's LayoutProps global resolves without a prior build (CI-safe)"
  - "Exact versions in package.json for next/react/tailwind/collector libs; caret only for @types/*, eslint ^9.39.5, typescript ~6.0.3"
  - "next-env.d.ts is committed (not ignored, unlike the scaffold's .gitignore)"
metrics:
  duration: "~15 min"
  completed: 2026-10-06
  tasks: 3
  files: 18
---

# Phase 1 Plan 01: Toolchain scaffold + static PT-BR shell Summary

Next 16.3.8 App Router scaffold in the existing repo root (TS 6.0.3, ESLint 9.39.5, Tailwind 4.3.3, Vitest 5, tsx), a static dark PT-BR `/` shell built from the UI-SPEC tokens, and the two-layer PIPE-06 static guard (`dynamic = 'error'` plus a manifest-based `check:static`).

## Tasks

| Task | Name | Commit | Notes |
| ---- | ---- | ------ | ----- |
| 1 | Package legitimacy gate | (none, gate only) | Approved by the user on 2026-10-06. The reply was "bora" (= approved) to the full install list as-is, with no removals. Nothing had been installed before the approval. |
| 2 | Scaffold Next 16, pin versions, wire toolchain | 65775de | create-next-app@16.3.8 ran in the session scratchpad, and only the listed files were copied. The scaffold's CLAUDE.md, README, .gitignore and public/ SVGs were not copied. |
| 3 | Static PT-BR dark page shell + static guard | 6c6bc5b | Tokens, layout, page shell, check-static.ts, build-views stub |

## Verification

- `npx tsc --version` prints Version 6.0.3. `npx eslint --version` prints v9.39.5.
- `npm run typecheck`, `npm run lint`, `npm test` (1 passed), `npm run build` and `npm run check:static` ("All 3 app routes are static.") all exit 0.
- The build route table shows `/` and `/_not-found` as ○ (Static). `.next/server/app/index.html` contains "AI Intelligence Hub" and "Atualizado automaticamente a cada hora".
- Negative check (not committed): adding `await headers()` to page.tsx made `next build` fail with "Route / with `dynamic = "error"` couldn't be rendered statically because it used `headers()`" (exit 1). The file was then restored.
- `git diff --quiet -- CLAUDE.md` exits 0. AGENTS.md contains the `nextjs-agent-rules` markers.
- `git check-ignore -q .claude` exits 0. `git check-ignore scripts/build-views.ts` exits 1. `/public/data/` is in .gitignore.
- Node on the dev box is v24.18.0 (24.x, as expected).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] typecheck failed on a clean tree (`Cannot find name 'LayoutProps'`)**
- **Found during:** Task 2
- **Issue:** The scaffold's layout uses the `LayoutProps` global. That global is generated into `.next/types` only by `next build`, `next dev` or `next typegen`, so `tsc --noEmit` on a fresh clone or in CI failed.
- **Fix:** Changed the `typecheck` script to `next typegen && tsc --noEmit`. The script key is unchanged.
- **Files modified:** package.json
- **Commit:** 65775de

**2. [Rule 2 - Correctness] Exact version pins**
- **Issue:** `npm i pkg@x.y.z` saved caret ranges. The threat model (T-01-SC) asks for exact pinned versions, and tailwindcss and @tailwindcss/postcss must stay identical.
- **Fix:** Removed the `^` from every package except @types/*, eslint (`^9.39.5`) and typescript (`~6.0.3`), then refreshed the lockfile.
- **Commit:** 65775de

**3. Planned deviation (documented in the plan): ESLint 9 instead of the ESLint 10.12.0 listed in CLAUDE.md.**

### Notes
- The scaffold's `src/app/favicon.ico` was not copied, because the plan's copy list excludes it. There is no favicon yet.
- `npm audit` reports 5 high-severity issues in the dev-only lint chain (braces → micromatch → fast-glob → @next/eslint-plugin-next → eslint-config-next). The only "fix" downgrades eslint-config-next to 14.x, which breaks the stack. These packages are dev-only and never reach the runtime or the static output. Deferred and not fixed.
- The allow-scripts warnings for esbuild and unrs-resolver are expected. `npm approve-scripts --all` was not run.

## Known Stubs

- `scripts/build-views.ts`: a one-line log stub, created on purpose so `npm run build` works. Plan 01-02 replaces it.
- `src/app/page.tsx` has an empty `<main>`. Plan 01-02 adds the status panel and list there.

## Threat Flags

None. No new network endpoints, auth paths or trust-boundary surface. All mitigations from the threat model were applied (T-01-SC, T-01-01, T-01-02, T-01-03).

## Self-Check: PASSED

- All 18 key files exist in the working tree. All are tracked except `.gitignore`, which was modified.
- Commits 65775de and 6c6bc5b are present in `git log`.
