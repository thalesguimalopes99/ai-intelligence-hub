---
phase: 01-walking-skeleton
reviewed: 2026-10-06T00:00:00Z
depth: standard
files_reviewed: 31
files_reviewed_list:
  - .github/workflows/ci.yml
  - .github/workflows/collect.yml
  - .gitignore
  - vercel.json
  - next.config.ts
  - package.json
  - tsconfig.json
  - eslint.config.mjs
  - vitest.config.ts
  - collector/adapters/rss.ts
  - collector/http.ts
  - collector/meta.ts
  - collector/pipeline/canonical-url.ts
  - collector/pipeline/merge.ts
  - collector/pipeline/normalize.ts
  - collector/run.ts
  - collector/store.ts
  - config/sources.ts
  - scripts/build-views.ts
  - scripts/check-static.ts
  - scripts/validate-data.ts
  - src/app/layout.tsx
  - src/app/page.tsx
  - src/app/globals.css
  - src/components/LiveStatus.tsx
  - src/lib/data.ts
  - src/lib/format-date.ts
  - src/lib/live-status.ts
  - src/shared/constants.ts
  - src/shared/schema.ts
  - src/shared/serialize.ts
findings:
  critical: 2
  warning: 7
  info: 8
  total: 17
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-10-06
**Depth:** standard
**Files Reviewed:** 31
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

The walking skeleton is careful in several places. Every dynamic value reaches the workflow shell through `env:`, so I found no script-injection path. GITHUB_OUTPUT values are validated. The JSON writes go through a tmp file and a rename. React escapes item text, and `href` only ever gets an `http(s)` URL that zod validated, so I found no XSS vector through feed content.

Two defects still conflict with the project's core value ("a source with an error can never break the process" and "the correct link to the original source"):

1. Items are validated **only as a whole set, at write time**. One feed entry that gets past `normalizeEntry` but fails the zod `Item` schema aborts the entire run (exit 1, nothing written). Because the same entry stays in the feed, this repeats every hour. I reproduced it with real inputs.
2. The canonical URL (built for dedupe) is also the URL the site shows and links to. That URL has been rewritten: `www.` stripped, https forced, and `ref` removed. It can point to a page other than the original, or to one that does not exist. Since the schema is declared frozen for all phases ("never add a migration"), this has to be decided now.

The remaining findings concern robustness: dates in the future or date-only, HTML in the excerpt, relative links, a size cap that does not protect memory, no global time budget, and the push loop.

## Critical Issues

### CR-01: One schema-invalid item aborts the whole collection run (resilience broken)

**File:** `collector/run.ts:50-62`, `collector/pipeline/normalize.ts:34-63`, `collector/store.ts:43-45`
**Issue:** `normalizeEntry` only drops entries with a non-http(s) link or an empty title. Every other field is validated later and in bulk by `ItemsFile.parse` in `writeState`. If any item fails, the run throws and `main()` exits 1 with nothing written. The bad entry stays in the source's feed, so **every hourly run fails** until a human steps in. One bad entry thereby takes down every other source, which is exactly what the core value forbids. I confirmed these reachable inputs with the repo's own zod and normalize-url versions:
- IDN domain: `https://пример.рф/a` → normalize-url gives `https://xn--e1afmkfd.xn--p1ai/a` → `z.httpUrl()` **rejects** it (the domain regex requires an alphabetic TLD `[a-zA-Z]{2,63}`).
- IP host: `https://1.2.3.4/a` → `z.httpUrl()` **rejects** it.
- Year >= 10000 in `pubDate` (`Sat, 01 Jan 10000 ...`) → `toISOString()` = `+010000-01-01T...` → `z.iso.datetime()` **rejects** it.

The `try/catch` per source in `run.ts` does not cover this, because the failure happens after the loop.
**Fix:** Validate each item at the source boundary and discard invalid ones (and count them, so `parser_contract` still fires when nothing is usable):
```ts
// normalize.ts (end of normalizeEntry)
const candidate = { id, url, title, /* ... */ };
const parsed = ItemSchema.safeParse(candidate);
return parsed.success ? parsed.data : null;
```
As defense in depth, `run.ts` can also run `ItemsFile.safeParse` on `items` before `writeState`. If that fails, filter out the invalid items and log them instead of aborting.

### CR-02: The link shown to the reader is the rewritten canonical URL, not the original link

**File:** `collector/pipeline/normalize.ts:35,44`, `collector/pipeline/canonical-url.ts:10-17`, `src/app/page.tsx:62`
**Issue:** `item.url = canonicalUrl(entry.link)`. The canonical form exists for the **id/dedupe**, but it applies destructive rules: `stripWWW` (many hosts do not serve the bare domain), `forceHttps` (an http-only site gets a broken link), `stripHash` (hash-routed SPAs lose their target) and `removeQueryParameters: ['ref', ...]`. I verified that `https://github.com/a/b/tree?ref=main` becomes `https://github.com/a/b/tree`, which is a different page (it loses the branch/tag). The core value requires "the correct link to the original source", and `schema.ts` declares the contract "complete for all phases… they never add a migration". As it stands there is no field that preserves the original link.
**Fix:** Keep the canonical URL only to derive `id`, and store and render the original link (trimmed and validated as http(s)):
```ts
const canonical = canonicalUrl(entry.link);
if (canonical === null) return null;
const original = new URL(entry.link.trim()).href; // already guaranteed http(s) by canonicalUrl
return { id: idFromUrl(canonical), url: original, /* optional: canonicalUrl: canonical */ ... };
```
At most, apply only non-destructive rules to the displayed URL (remove `utm_*`/`fbclid`/`gclid`), and never `ref`, `www`, the hash or the protocol.

## Warnings

### WR-01: A future `publishedAt` pins the item to the top of the feed indefinitely

**File:** `collector/pipeline/normalize.ts:27-31`, `collector/pipeline/merge.ts:28-30`, `src/shared/serialize.ts:14-29`
**Issue:** `toIso` accepts any date. A feed with a typo (`2099-10-06`, which I confirmed parses and passes zod) produces an item sorted first forever. The 30-day window only cuts the past (`>= cutoff`), and since "stored items win" the value is never corrected even if the feed fixes it.
**Fix:** In `toIso`/`normalizeEntry`, treat `publishedAt > now + 24h` as invalid (`publishedAt: null`, `datePrecision: "none"`, consistent with "never stamp now"). Alternatively, have the merge window also drop items beyond `now + tolerance`.

### WR-02: A date-only `pubDate` is stored as midnight UTC "datetime" and shown as the previous day; the `"day"` branch is dead

**File:** `collector/pipeline/normalize.ts:27-31,52`, `src/lib/format-date.ts:17-25`
**Issue:** `new Date("2026-10-06")` → `2026-10-06T00:00:00.000Z` (confirmed), and normalize always records `datePrecision: "datetime"`. On the site, `formatItemDate` converts to Brasília and shows `05/10/2026 · 21:00`, which is the wrong day and a time that does not exist in the source. The comment in `format-date.ts` says "the collector stores day-only dates as noon UTC", but no collector code does that. The `datePrecision === "day"` path is never produced.
**Fix:** In `toIso`, detect date-only input (`/^\d{4}-\d{2}-\d{2}$/` or RFC 822 with no time) and return `{ iso: "YYYY-MM-DDT12:00:00.000Z", precision: "day" }`, propagating it to `datePrecision`. Alternatively, fix the misleading comment.

### WR-03: The excerpt keeps raw HTML and entities, breaking the "plain text" contract

**File:** `collector/pipeline/normalize.ts:46`, `collector/adapters/rss.ts:41,50`, `src/shared/schema.ts:39`
**Issue:** RSS `description` / Atom `summary` often carry HTML (`<p>`, `<a href>`, `&amp;nbsp;`). `collapse` only normalizes whitespace, and the 280-character cut can land in the middle of a tag. The schema documents `excerpt` as "plain text". The page does not render the excerpt yet, but the persisted data is already polluted (and protected against churn by "stored items win", so it will not be fixed retroactively). When a later phase renders it, it will show literal tags. React escapes, so this is not XSS, but it is a quality and data-integrity defect.
**Fix:** Strip tags and decode entities before `collapse` (cheerio is already in the planned stack: `cheerio.load(html).text()`, or a simple regex plus an entity decoder), then truncate.

### WR-04: Relative links and permalink `guid` are not resolved, so an entire feed can fail with `parser_contract`

**File:** `collector/pipeline/canonical-url.ts:8`, `collector/adapters/rss.ts:38-44`
**Issue:** `canonicalUrl` drops anything that does not start with `http(s)://`. Feeds with relative `<link>` (`/news/foo`, common in Atom with `xml:base`) or with no `<link>` but a `<guid isPermaLink="true">` lose every item. The source is then marked `parser_contract` even though the feed is valid. `RawEntry.guid` is collected and never used.
**Fix:** Resolve against the feed/source URL before canonicalizing (`new URL(link, source.url).href`, keeping the http(s) check afterwards). Use `guid` as a fallback when `link` is empty and the guid is an http(s) permalink.

### WR-05: `MAX_FEED_BYTES` does not protect memory, because the body is fully buffered before the check

**File:** `collector/http.ts:90-100`
**Issue:** The early check depends on `content-length`. Chunked responses (no header) go to `await res.text()`, which buffers everything and only then compares `text.length` (UTF-16 units, not bytes). A huge or endless response is limited only by the time budget (`totalTimeout` 60 s), not by size.
**Fix:** Read `res.body` with a reader and accumulate a byte count, calling `reader.cancel()` and throwing `FetchError("invalid", ...)` once `MAX_FEED_BYTES` is exceeded. Then decode with `TextDecoder`.

### WR-06: No global time budget for the run; the sequential loop will exceed `timeout-minutes: 10` as sources grow

**File:** `collector/run.ts:47-71`, `collector/http.ts:12-20`, `.github/workflows/collect.yml:28`
**Issue:** Each source can take up to `totalTimeout` 60 s (plus body reading), and sources run serially. With the ~25 sources planned, the worst case (~25 min) exceeds the job's 10 minutes. GitHub kills the job and **nothing is written or committed**, so meta.json does not even record the health. CLAUDE.md prescribes an `AbortSignal.timeout(240_000)` global budget, which is not implemented. Latent in Phase 1 (1 source), but the contract is being set now.
**Fix:** Create a global `AbortController` with a deadline (~4 min), pass `signal` to ky, and once the deadline passes mark the remaining sources as `timeout` without fetching. Add `p-limit` for concurrency when sources are added.

### WR-07: The push loop fails before logging an error, and its last iteration does a wasted pull and sleep

**File:** `.github/workflows/collect.yml:84-93`
**Issue:**
- `git pull --rebase origin main || { git rebase --abort; echo "::error::..."; exit 1; }`: the default `run` shell is `bash -e`. If the pull fails for a **network/fetch** reason (no rebase in progress), `git rebase --abort` returns non-zero inside the group after the last `||`. `-e` applies there, so the step dies with the abort's error and never prints the `::error::Rebase conflict` annotation, which makes diagnosis harder.
- On attempt 3, after the failed push, the loop still runs `pull --rebase` and `sleep 15` and then exits without trying to push again.
- The rebased data (produced against the old tip) is not revalidated after the rebase.
**Fix:**
```bash
for attempt in 1 2 3; do
  if git push origin HEAD:main; then echo "pushed=true" >> "$GITHUB_OUTPUT"; exit 0; fi
  [ "$attempt" -eq 3 ] && break
  sleep $((attempt * 5))
  if ! git pull --rebase origin main; then
    git rebase --abort 2>/dev/null || true
    echo "::error::Rebase/pull failed"; exit 1
  fi
done
```
Optionally run `npm run validate:data` after a rebase that brought in new commits.

## Info

### IN-01: Two files written in sequence plus `writeGithubOutput` after the write, so the "nothing written" contract is not strictly true

**File:** `collector/store.ts:52-53`, `collector/run.ts:1-6,106-114`
**Issue:** If `meta.json` fails after `items.json` was renamed, or `writeGithubOutput` throws after `writeState`, `main` logs "aborted, nothing written" even though data was written. In CI the job fails and does not commit, so the impact is small, but the message and the documented contract are wrong.
**Fix:** Write both tmp files first and rename at the end, and adjust the log message.

### IN-02: `meta.json` changes on every run, so every hourly run commits and deploys

**File:** `collector/store.ts:53`, `.github/workflows/collect.yml:75-78`
**Issue:** `lastRunAt` and `durationMs` always change, so the "No data changes" branch effectively never runs. That means 24 commits and 24 Vercel deploys per day even with no news (within the 100/day limit, but it uses up quota and history). Record it as a deliberate decision, or skip the commit when only `run.*`/`lastRunAt` changed and `lastSuccessAt` advanced by less than X.

### IN-03: `hold_seconds` up to 600 matches `timeout-minutes: 10`

**File:** `.github/workflows/collect.yml:28,63`
**Issue:** With hold=600, collection plus the hold always exceeds the job timeout, and the run dies before committing. Lower the cap (e.g. 300).

### IN-04: `build-views` and `validate-data` detect "main" without `path.resolve`

**File:** `scripts/build-views.ts:43-44`, `scripts/validate-data.ts:40-41`
**Issue:** `run.ts` uses `pathToFileURL(path.resolve(argv[1]))`, but these scripts use `argv[1]` without resolving it. If any runner passes a relative path, the script silently does nothing and exits 0, and the build goes on without regenerating `public/data/meta.json`. Unify on the `run.ts` pattern.

### IN-05: `validate-data` does not check the item order

**File:** `scripts/validate-data.ts:22-25`
**Issue:** `serializeItemsFile` does not sort, so an unordered `items.json` passes the "stable serialization" check. Compare against `serializeItemsFile({ ...parsed, items: sortItems(parsed.items) })`.

### IN-06: `lang="en"` and "Últimas da OpenAI" are hardcoded on the page

**File:** `src/app/page.tsx:55,68`
**Issue:** `item.lang` exists in the schema but is ignored. Use `lang={item.lang}`. The heading will become wrong as soon as a second source is added.

### IN-07: `<time>` without `dateTime` for items with no date

**File:** `src/app/page.tsx:78-83`
**Issue:** When `publishedAt` is null, a `<time>` without a machine-readable value is rendered, which is semantically wrong. Use `<span>` in that case.

### IN-08: Dead `RawEntry.guid` field and `check-static` coupled to the cwd and to literal keys

**File:** `collector/adapters/rss.ts:10,43,52`, `scripts/check-static.ts:7-8,22-23`
**Issue:** `guid` is collected and never used (see WR-04). `check-static` uses `.next/...` paths relative to the cwd, and compares the values of `app-path-routes-manifest` (e.g. `/posts/[id]`) with the concrete keys of `prerender-manifest.routes`. When a dynamic segment with `generateStaticParams` appears it will report a false positive, so `prerender.dynamicRoutes` also needs to be considered.

---

_Reviewed: 2026-10-06_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
