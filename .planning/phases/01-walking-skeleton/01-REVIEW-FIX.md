---
phase: 01-walking-skeleton
fixed_at: 2026-10-06T14:30:00Z
review_path: .planning/phases/01-walking-skeleton/01-REVIEW.md
iteration: 1
findings_in_scope: 9
fixed: 9
skipped: 0
status: all_fixed
---

# Phase 1: Code Review Fix Report

**Fixed at:** 2026-10-06
**Source review:** .planning/phases/01-walking-skeleton/01-REVIEW.md
**Iteration:** 1
**Scope:** critical + warning (CR-01, CR-02, WR-01 … WR-07). IN-* not touched.

**Summary:**
- Findings in scope: 9
- Fixed: 9
- Skipped: 0

**Final gates (worktree, after all fixes):** `npm run typecheck` OK · `npm run lint` OK · `npx vitest run` 13 files / 146 tests OK · `npm run build` OK (all routes ○ static) · `npm run check:static` "All 3 app routes are static."

**Backward compatibility with the bot data on origin/main (68 items, e024a9b):** copied via `git show origin/main:data/{items,meta}.json` into a scratch DATA_DIR. `validate:data` OK (68 items). `npm run build` with that DATA_DIR OK, 50 links rendered, check:static OK. A live `npm run collect` on a copy of it: run_status=ok, all 68 items gained `canonicalUrl`, `validate:data` OK, and a further run left items.json byte-identical.

## Fixed Issues

### CR-01: One schema-invalid item aborts the whole collection run

**Files modified:** `collector/pipeline/normalize.ts`, `collector/run.ts`, `tests/normalize-openai.test.ts`, `tests/run.test.ts`
**Commit:** 386f3da
**Applied fix:** New `normalizeEntryResult` runs `Item.safeParse` on each candidate and returns `{ ok:false, reason }` (fields listed) instead of an item. `normalizeEntry` is kept as a wrapper. `run.ts` logs each dropped entry with `console.warn` (reason + sanitized link). When 0 entries survive it still throws `parser_contract`, now including the reasons. A final `Item.safeParse` filter runs before `writeState` as defense in depth. Tests cover an IDN host, an IP host, year 10000 and a run-level mix of good and bad entries (the good item is written, health ok), plus an only-bad feed (parser_contract, previous items kept).

### CR-02: The link shown to the reader is the rewritten canonical URL

**Files modified:** `src/shared/schema.ts`, `collector/pipeline/normalize.ts`, `collector/pipeline/merge.ts`, `scripts/validate-data.ts`, tests (`normalize-openai`, `merge`, `run`, `serialize`, `schema`)
**Commit:** b1ffc1a
**Applied fix:**
- `Item.url` is now the original link: trimmed, WHATWG-serialized, http(s) only. It is what `page.tsx` already renders through `href={item.url}`, so the page needed no change.
- New `Item.canonicalUrl: z.httpUrl().optional()` holds the normalize-url form. It is used only for `id = sha256(canonicalUrl)` and dedupe.
- The field is optional because legacy items (written before this fix) lack it, and their `url` already is the canonical form.
- `mergeItems` upgrades a legacy item exactly once, when the feed shows it again: it takes the feed's `url` and `canonicalUrl` and keeps every other stored field. After that the item is stable.
- `validate-data` now also checks `id == sha256(canonicalUrl ?? url)`.

### WR-01: A future publishedAt pins the item to the top indefinitely

**Files modified:** `collector/pipeline/normalize.ts`, `tests/normalize-openai.test.ts`
**Commit:** 97328ab
**Applied fix:** In `toIso`, any date beyond `now + 24h` becomes `publishedAt: null` with `datePrecision: "none"`; it is never stamped as "now". As a side effect, year >= 10000 now degrades to "no date" instead of being dropped, and the CR-01 test was updated to match.

### WR-02: Date-only pubDate stored as midnight UTC "datetime"

**Files modified:** `collector/pipeline/normalize.ts`, `src/lib/format-date.ts`, `src/app/page.tsx`, `tests/normalize-openai.test.ts`
**Commit:** 3406d66
**Status:** fixed: requires human verification (date-parsing logic)
**Applied fix:**
- Date-only input is detected in two forms: ISO `YYYY-MM-DD`, and RFC 822 without a time (`[Mon, ]05 Oct 2026`, including 2-digit years). It is stored as noon UTC with `datePrecision: "day"`.
- Impossible days (`2026-02-31`) become "no date".
- On the page, `<time dateTime>` carries only `YYYY-MM-DD` for day precision, and the visible text is `dd/MM/yyyy` with no time.
- The `format-date.ts` comment now points to the code that produces these values.

### WR-03: Excerpt keeps raw HTML and entities

**Files modified:** `collector/pipeline/normalize.ts`, `tests/normalize-openai.test.ts`
**Commit:** c8c932c
**Applied fix:** New `htmlToText` removes comments, `script`/`style` bodies and tags, then decodes named and numeric entities once. Invalid code points are kept literal. This runs before `collapse`, and the 280-character cut happens afterwards. No dependency was added; cheerio is not installed yet.

### WR-04: Relative links and permalink guid not resolved

**Files modified:** `collector/pipeline/normalize.ts`, `collector/adapters/rss.ts`, `tests/normalize-openai.test.ts`
**Commit:** 7798a8d
**Applied fix:**
- New `resolveEntryLink` resolves root-relative, protocol-relative, dot-relative and `?query` links against `source.url`.
- When `<link>` is empty, it falls back to the guid, but only if the guid is an http(s) URL.
- The RSS adapter no longer emits guids marked `isPermaLink="false"`.
- **Extra bug found while testing the Atom path:** feedsmith returns Atom `title` and `summary` as `{ value }`, so `str()` read them as "" and every Atom entry was dropped as "empty title". `atomText()` fixes this; it is included in the same commit because the finding's Atom scenario depends on it.

### WR-05: MAX_FEED_BYTES does not protect memory

**Files modified:** `collector/http.ts`, `tests/http.test.ts` (new)
**Commit:** 0d1bb10
**Applied fix:** New `readBodyCapped(res, max)` reads `res.body` with a reader, counts UTF-8 bytes, and calls `reader.cancel()` + `FetchError("invalid")` as soon as the cap is exceeded. It decodes with a streaming `TextDecoder`, which matches `Response.text()`. The content-length pre-check stays.

### WR-06: No global time budget for the run

**Files modified:** `collector/run.ts`, `collector/http.ts`, `src/shared/constants.ts`, `tests/run.test.ts`, `tests/http.test.ts`
**Commit:** b25bd78
**Applied fix:**
- New constant `RUN_BUDGET_MS = 240_000`, which can be overridden for tests with `budgetMs`.
- `runCollector` owns one `AbortController`, aborted with `DOMException("TimeoutError")`, and passes its signal to `fetchText`/ky. This aborts both the request and the body read; this was verified against a local server that hangs mid-body (abort after ~325 ms, classified as `timeout`).
- Once the deadline passes, the remaining sources are recorded as `timeout` without being fetched, and meta.json is still written.
- `classifyFetchError` maps `DOMException` TimeoutError/AbortError to `timeout`.
- p-limit was not added: it is not needed with 1 source.

### WR-07: Push loop fails before logging and wastes the last iteration

**Files modified:** `.github/workflows/collect.yml` (edited only with the Edit tool), `tests/workflows.test.ts`
**Commit:** e51c07f
**Status:** fixed: requires human verification (only fully provable on a real runner with a push race)
**Applied fix:**
- Attempt 3 now breaks before any sleep or pull.
- The pull runs inside `if ! …; then`, so bash -e cannot kill the step, then `git rebase --abort 2>/dev/null || true`, then the `::error::Pull/rebase failed` annotation and `exit 1`.
- After a successful rebase, `npm run validate:data` revalidates the data before the next attempt.
- The new test locks the order: break before sleep and pull, the safe abort, and revalidation.
- The bash in the block passes `bash -n`, and the YAML parses with js-yaml.

---

_Fixed: 2026-10-06_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
