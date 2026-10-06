---
phase: 01-walking-skeleton
plan: 02
subsystem: data contract / build pipeline / page
tags: [zod, schema, serializer, build-views, ssg, DATA-01, DATA-07, DATA-08]
requires: ["01-01"]
provides:
  - "src/shared/constants.ts: SCHEMA_VERSION, CATEGORIES (13), WINDOW_DAYS, FEED_LIMIT=50, LIVE/DELAYED thresholds, POLL/CLOCK intervals, MAX_FEED_BYTES, TZ_BRASILIA, USER_AGENT, DATA_DIR_DEFAULT, PUBLIC_DATA_DIR"
  - "src/shared/schema.ts: Item, ItemsFile, Meta, SourceHealth, PublicMeta, ScoreBreakdown, ClusterInfo, Category, DatePrecision, ItemKind, ErrorKind + inferred types (complete for all phases)"
  - "src/shared/serialize.ts: sortItems, serializeItemsFile (one item per line), serializeJson"
  - "src/lib/data.ts: resolveDataDir (honours DATA_DIR), loadItemsFile, loadMeta"
  - "src/lib/format-date.ts: formatAbsolute, formatItemDate"
  - "src/components/LiveStatus.tsx: static LiveStatus({ initialLastSuccessAt })"
  - "scripts/build-views.ts: buildViews({ dataDir, outDir }) -> public/data/meta.json (PublicMeta)"
  - "scripts/validate-data.ts: validateData(dataDir) + CLI"
affects: [01-04, 01-05, 01-07, 01-08]
tech-stack:
  added: []
  patterns:
    - "One zod schema shared by collector and site; framework-free src/shared/"
    - "Missing data/ => empty state; invalid data/ => build fails (last good deploy stays)"
    - "Atomic write (tmp + renameSync) for generated JSON"
    - "Script main guard: import.meta.url === pathToFileURL(process.argv[1]).href"
    - "Scripts import src via relative paths (no alias dependency for tsx/collector)"
key-files:
  created:
    - src/shared/constants.ts
    - src/shared/schema.ts
    - src/shared/serialize.ts
    - src/lib/data.ts
    - src/lib/format-date.ts
    - src/components/LiveStatus.tsx
    - scripts/validate-data.ts
    - tests/schema.test.ts
    - tests/serialize.test.ts
    - tests/build-views.test.ts
    - tests/format-date.test.ts
  modified:
    - scripts/build-views.ts
    - src/app/page.tsx
decisions:
  - "PublicMeta reuses the Meta run-status enum (nullable) and excludes the sources array (T-01-06)"
  - "Loader errors are rethrown as `Invalid <file>: <zod message>` with the original as cause, so a failed build names the bad file"
  - "resolveDataDir marks process.cwd() with /*turbopackIgnore: true*/ to stop Turbopack tracing the whole project into server output"
  - "Badge label 'verificando' is aria-hidden; the sr-only sentence 'Verificando o status da atualização.' carries the accessible text (avoids double announcement)"
metrics:
  duration: "~12 min"
  completed: 2026-10-06
  tasks: 3
  files: 13
---

# Phase 1 Plan 02: Shared data contract, build-views and data-driven page Summary

A complete cross-phase zod contract (Item with cluster/score/scoreBreakdown/datePrecision/firstSeenAt, ItemsFile, Meta with per-source health, compact PublicMeta), a deterministic one-item-per-line serializer, build-time loaders that tolerate a missing `data/` and fail the build on corrupt data, a `build-views` step writing `public/data/meta.json`, and the static page rendering the "verificando" status panel plus up to 50 items or the PT-BR empty state.

## Tasks

| Task | Name | Commits | Notes |
| ---- | ---- | ------- | ----- |
| 1 | Shared contract: constants, full zod schema, stable serializer | 83e5852 (RED), 038b83c (GREEN) | 25 tests |
| 2 | Build-time loaders, build-views and validate-data | 7fe129c (RED), 20305ae (GREEN) | 7 tests, tmpdir fixtures only |
| 3 | Page renders status panel + up to 50 items or empty state | d344908 (RED), 68fd2db (GREEN) | 6 tests + build checks |

## Verification

- `npx vitest run`: 5 files, 39 tests pass. `npm run typecheck`, `npm run lint`, `npm run validate:data` ("no data/ yet, skipping"), `npm run build` and `npm run check:static` ("All 3 app routes are static.") all exit 0 with no `data/` present.
- With no `data/`: `public/data/meta.json` is `{"schemaVersion":1,"lastRunAt":null,"lastSuccessAt":null,"lastRunStatus":null}`. `.next/server/app/index.html` contains "Nenhuma notícia por aqui ainda", "verificando", "ainda nenhuma coleta concluída" and "Últimas da OpenAI".
- Populated path (not committed): `DATA_DIR=<scratch>` with 55 generated items (one with a null date). The build rendered exactly 50 `<li>` (newest first, null-date item sorted last and cut), the status line "06/10 14:17 (Brasília)", titles with `<b>` HTML escaped as text, and the compact meta.json carrying the timestamps.
- Corrupt data (`schemaVersion: 2` in items.json via DATA_DIR) made `npm run build` exit 1.
- `validate-data` with DATA_DIR: a stable-serialized file passes, while a compact (non-stable) items.json exits 1 with "not in stable serialization".
- Grep gates: no `dangerouslySetInnerHTML` in src. No `use client` in LiveStatus. No next/react imports in src/shared. `z.httpUrl()` and `z.iso.datetime()` are present. `renameSync` is in build-views and `DATA_DIR` is in data.ts. No `data/` dir exists after the tests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Turbopack whole-project tracing warning**
- **Found during:** Task 3 (`npm run build`)
- **Issue:** `path.resolve(process.cwd(), process.env.DATA_DIR ?? ...)` in `src/lib/data.ts` triggered "Dynamic filesystem access causes tracing of the whole project". Left alone, all source files and `public/` could be bundled into the server output.
- **Fix:** Added `/*turbopackIgnore: true*/` before `process.cwd()`, as the Next.js warning suggests. The build is now warning-free and still reads `data/` at build time.
- **Files modified:** src/lib/data.ts
- **Commit:** 68fd2db

### Minor implementation choices (within plan latitude)
- The `mt-6` spacing for LiveStatus sits on a wrapper `<div>` in page.tsx, so the component keeps a margin-free API for plan 01-05.
- Extra tests beyond the listed behaviour: rejection of `data:` URLs, rejection of unknown categories, negative `consecutiveFailures`, a day-precision UTC boundary case, and the Brasília day boundary.
- `validate-data.ts` also exports `validateData(dataDir)` so it can be reused.

## Known Stubs

- `src/components/LiveStatus.tsx` is intentionally static ("verificando" only). Plan 01-05 turns it into the client island with the same props.

## Threat Flags

None. T-01-04 (httpUrl, React text only, `rel="noopener noreferrer"`, grep gate) and T-01-05 (zod parse in loaders/build-views throws and fails the build, plus validate-data) are mitigated as planned. T-01-06 is accepted: PublicMeta exposes only timestamps and run status.

## TDD Gate Compliance

Each task has a `test(01-02)` RED commit followed by a `feat(01-02)` GREEN commit. No refactor commits were needed.

## Self-Check: PASSED

- All 13 key files exist.
- Commits 83e5852, 038b83c, 7fe129c, 20305ae, d344908 and 68fd2db are present in `git log`.
