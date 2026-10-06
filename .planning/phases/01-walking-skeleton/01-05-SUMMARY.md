---
phase: 01-walking-skeleton
plan: 05
subsystem: site
tags: [live-badge, client-island, polling, useSyncExternalStore, a11y]
requires: ["01-02"]
provides: ["FEED-06 client-computed LIVE/atrasado/parado badge with 60 s same-origin polling"]
affects: [src/components/LiveStatus.tsx]
tech-stack:
  added: []
  patterns: ["module-level clock store + useSyncExternalStore (server snapshot null)", "pure status functions with explicit nowMs", "hand-written payload guard instead of zod in client bundle", "aria-live set imperatively after first evaluation"]
key-files:
  created: [src/lib/live-status.ts, tests/live-status.test.ts]
  modified: [src/components/LiveStatus.tsx]
decisions:
  - "aria-live is set imperatively in an effect (not as a render prop) once the first real state is committed, so verificando to first state is silent and no ref is read during render"
  - "parseLastSuccessAt is a hand check (object, own key, null or Z-terminated finite date); arrays rejected"
metrics:
  duration: ~10 min
  completed: 2026-10-06
  tasks: 2
  files: 3
requirements: [FEED-06]
---

# Phase 1 Plan 05: LIVE badge client island Summary

The static LiveStatus panel is now a hydration-safe `"use client"` island. It computes LIVE (< 90 min), atrasado (90 to 180 min, inclusive) or parado (> 180 min or null/invalid) in the browser from `lastSuccessAt`. It shows "há N min · dd/MM HH:mm (Brasília)", advances on a 30 s tick and polls same-origin `/data/meta.json` every 60 s with `cache: 'no-store'`. Polling pauses while the tab is hidden.

## Tasks

| Task | Name | Commits | Files |
|------|------|---------|-------|
| 1 | Pure live-status functions (TDD) | 647277f (RED), 3841f5a (GREEN) | src/lib/live-status.ts, tests/live-status.test.ts |
| 2 | Client island: clock store + polling | 0f5aad1 | src/components/LiveStatus.tsx (+ comment tweak in live-status.ts) |

## Verification

- `npx vitest run`: 7 files, 80 tests passed (21 in live-status.test.ts covering every listed boundary)
- `npm run typecheck`, `npm run lint` (no set-state-in-effect), `npm run build` and `npm run check:static` ("All 3 app routes are static") all passed
- `.next/server/app/index.html` still contains "verificando"
- Grep gates: line 1 is `"use client"`; no `https?://` or githubusercontent in the island; no `formatDistance` and no zod import in live-status.ts; `src/app/page.tsx` unchanged
- Spot check (`next start` on :3457): served HTML shows "verificando" plus "Última atualização: ainda nenhuma coleta concluída." (current meta has null lastSuccessAt), and `/data/meta.json` returns 200 JSON. **Not done:** watching the browser DevTools console for hydration warnings and the repeating 60 s request, because no browser was available in this agent. This needs a human or Playwright check.

## Deviations from Plan

**1. [Rule 3 - Blocking] Reworded a comment in live-status.ts**
- **Found during:** Task 2 acceptance gates
- **Issue:** A doc comment containing the word "formatDistance" made the `grep -F "formatDistance"` gate fail.
- **Fix:** The comment now says "explicit differenceIn* buckets". Committed in 0f5aad1.

**2. aria-live implementation detail.** The plan suggested a ref flag. To stay lint-clean under react-hooks v7, which forbids reading refs during render, the `aria-live="polite"` attribute is instead set on the region's DOM node in an effect that depends on `evaluated`. The server HTML has no aria-live attribute, which is equivalent to "off". The result is the same behavior the plan asked for.

## TDD Gate Compliance

The RED commit `test(01-05)` 647277f comes before the GREEN commit `feat(01-05)` 3841f5a. RED failed as expected because the module was missing.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: src/lib/live-status.ts, src/components/LiveStatus.tsx, tests/live-status.test.ts
- FOUND commits: 647277f, 3841f5a, 0f5aad1
