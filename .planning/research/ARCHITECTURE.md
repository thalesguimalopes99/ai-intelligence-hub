# Architecture Research

**Domain:** Scheduled collector (GitHub Actions) + static Next.js site (Vercel) news aggregator, with JSON-in-git as the only store
**Researched:** 2026-10-06
**Confidence:** MEDIUM-HIGH (platform behaviour verified against Vercel/GitHub docs; size estimates and clustering thresholds are engineering estimates and need tuning against real data)

## Standard Architecture

Two programs share one repo and one schema. They never call each other at runtime. The only thing they share is **files committed to git**.

### System Overview

```
┌──────────────────────────── GitHub Actions (hourly cron + workflow_dispatch) ─────────────────────────────┐
│                                                                                                          │
│  config/sources.ts ──► ┌──────────────────────── COLLECTOR (Node + tsx) ───────────────────────────────┐ │
│  config/rules/*.ts ──► │                                                                              │ │
│                        │  1 FETCH     adapters[kind](source)  ── allSettled, timeout, retry, cond-GET  │ │
│  data/state/*.json ──► │       │  RawEntry[] per source  +  SourceRunResult (ok/err/notModified)      │ │
│  data/items.json   ──► │  2 NORMALIZE  canonicalUrl, id=hash(url), dates, excerpt trim → Item       │ │
│                        │  3 MERGE      union with previous items (keep firstSeenAt; last-good kept)  │ │
│                        │  4 DEDUPE     exact: same id  ·  fuzzy: title/entity similarity → clusterId │ │
│                        │  5 CLASSIFY   rules → categories[], primaryCategory                        │ │
│                        │  6 SCORE      rules(now) → score 0–100 + scoreBreakdown                    │ │
│                        │  7 VALIDATE   zod parse whole dataset; abort write on failure              │ │
│                        │  8 STORE      items.json (30d) · archive/YYYY-MM.json · meta.json · state  │ │
│                        └──────────────────────────────────────────────────────────────────────────────┘ │
│                                         │ git diff → commit (author = repo owner) → pull --rebase → push │
└─────────────────────────────────────────┼────────────────────────────────────────────────────────────────┘
                                          ▼
                              GitHub repo (main) ── webhook ──► Vercel Git integration
                                                                   │
┌──────────────────────────────── Vercel build (next build, static) ┼───────────────────────────────────────┐
│  prebuild: scripts/build-views.ts  reads data/** ──► public/data/{feed-7d,feed-30d,trending,top-week,    │
│                                                    meta,sources}.json + public/data/archive/*.json     │
│  next build: Server Components read data/** via lib/data.ts (zod-validated) → static HTML             │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                          ▼
┌──────────────────────────────── Browser ────────────────────────────────────────────────────────────────┐
│  Static HTML (first ~40 cards, Destaques, Em alta pre-rendered)                                         │
│  hydrate → fetch /data/feed-7d.json (lazy feed-30d.json) → client-side filters synced to URL            │
│  every 60s: fetch /data/meta.json (no-store) → LIVE / "atrasado" badge; if newer → "N novos" banner     │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Data flow is strictly one-directional:** sources → collector → `data/` (git) → build → `public/data/` + HTML → browser. The site never writes; the collector never imports React/Next code; the browser never talks to sources.

### Component Responsibilities

| Component | Responsibility | Talks to | Typical Implementation |
|-----------|----------------|----------|------------------------|
| **Shared schema** (`src/shared/`) | Zod schemas + inferred TS types for `Item`, `Meta`, `SourceHealth`, `Cluster`; constants (categories, window days) | Imported by collector, build-views script, Next app | `zod` schemas, `z.infer<>` types; zero runtime deps beyond zod |
| **Source registry** (`config/sources.ts`) | Declarative list of sources: id, kind, url, company, weight, filters, optional flag, limits | Read by collector orchestrator | Typed TS array (`satisfies SourceConfig[]`) — TS not JSON because filters/regex/extractors need code and type-checking |
| **Rules** (`config/rules/`) | Category keyword/regex tables, scoring weights, boosts, penalties, highlight criteria, cluster thresholds | Read by classify/score/cluster pure functions | Typed TS data objects; no logic |
| **HTTP fetcher** (`collector/http.ts`) | One place for UA header, `AbortSignal.timeout`, retry w/ backoff, conditional GET (ETag/Last-Modified), size cap, status → typed error | Used by every adapter | Node 20+ native `fetch` |
| **Adapters** (`collector/adapters/`) | Turn one source's bytes into `RawEntry[]`. No scoring, no dedupe, no I/O beyond fetch | HTTP fetcher; return to orchestrator | `rss` (RSS+Atom), `json` (HF daily papers, arXiv API), `html` (per-site extractor: anthropic, meta), `sitemap` |
| **Pipeline stages** (`collector/pipeline/`) | normalize, merge, dedupe/cluster, classify, score, prune — each a **pure function** `(input, rules, now) → output` | Orchestrator only | Plain TS functions, fully unit-testable |
| **Store** (`collector/store.ts`) | Read previous state, write new files atomically (tmp + rename), stable serialization, monthly archive upsert | Filesystem `data/` | `fs/promises` |
| **Orchestrator** (`collector/run.ts`) | Wire it all, decide exit code (fail only if all sources failed or validation failed), print run summary for Actions log | Everything in collector | Single entry `tsx collector/run.ts` |
| **Workflow** (`.github/workflows/collect.yml`) | Schedule, concurrency lock, run collector, commit-if-changed, push | GitHub, repo | Actions YAML |
| **View builder** (`scripts/build-views.ts`) | Derive client-facing compact JSON files from canonical `data/` at build time | `data/` → `public/data/` (gitignored) | Runs as `prebuild` npm script on Vercel |
| **Next app** (`src/app/`) | Static pages; build-time read of data; client islands for filters, LIVE polling, share | `lib/data.ts` (build), `/data/*.json` (runtime) | Next.js App Router, static output |

## Recommended Project Structure

Single `package.json` (no workspaces). Workspaces/turborepo add friction for zero benefit at this size; tsconfig path aliases give sharing for free.

```
/
├── config/
│   ├── sources.ts              # Source registry (the only file you edit to add a source)
│   └── rules/
│       ├── categories.ts       # 13 categories → keywords/regex, priority order
│       ├── scoring.ts          # source weights, boosts, penalties, decay half-life
│       ├── entities.ts         # model/product name patterns (GPT-*, Claude *, Gemini *, Llama *…)
│       └── highlights.ts       # what counts as "lançamento grande"
├── collector/
│   ├── run.ts                  # orchestrator / CLI entry
│   ├── http.ts                 # fetchWithPolicy(url, {timeoutMs, retries, etag})
│   ├── adapters/
│   │   ├── index.ts            # registry: kind → adapter
│   │   ├── rss.ts              # RSS 2.0 + Atom (incl. GitHub releases.atom, Reddit .rss)
│   │   ├── hf-daily-papers.ts  # JSON
│   │   ├── arxiv.ts            # API/RSS + volume cap
│   │   ├── sitemap.ts          # anthropic sitemap lastmod → candidate URLs
│   │   └── html/
│   │       ├── anthropic.ts    # extractor for /news
│   │       └── meta-ai.ts      # extractor for ai.meta.com/blog
│   ├── pipeline/
│   │   ├── normalize.ts        # RawEntry → Item (canonicalUrl, id, dates, excerpt)
│   │   ├── canonical-url.ts
│   │   ├── merge.ts            # previous ∪ new, keep firstSeenAt, update lastSeenAt
│   │   ├── cluster.ts          # exact + fuzzy grouping → clusterId, coverage
│   │   ├── classify.ts
│   │   ├── score.ts
│   │   └── prune.ts            # window cut + archive routing
│   └── store.ts                # read/write data/, atomic, stable JSON
├── src/
│   ├── shared/
│   │   ├── schema.ts           # zod: Item, Meta, SourceHealth, Cluster
│   │   └── constants.ts        # CATEGORIES, WINDOW_DAYS, LIVE_THRESHOLD_MIN
│   ├── lib/
│   │   ├── data.ts             # build-time loaders (server-only)
│   │   └── views.ts            # pure selectors: highlights, trending, topWeek (shared by build-views + pages)
│   ├── app/                    # routes: /, /historico, /historico/[mes], /fontes, /sobre
│   └── components/
├── scripts/
│   └── build-views.ts          # data/ → public/data/*.json  (prebuild)
├── data/                       # CANONICAL, committed by bot only
│   ├── items.json              # rolling 30-day window
│   ├── meta.json               # lastUpdated, run summary, per-source health
│   ├── state/sources.json      # etag/last-modified, consecutiveFailures, lastSuccessAt
│   └── archive/2026-10.json    # monthly, slim records, upsert-only
├── public/data/                # GENERATED at build, .gitignored
├── tests/
│   ├── fixtures/
│   │   ├── feeds/              # saved real responses: openai.xml, deepmind.xml, hf-papers.json, anthropic-news.html …
│   │   ├── labeled-titles.json # ~80 real titles with expected categories/highlight flag
│   │   └── cluster-cases.json  # pairs that must / must not cluster
│   ├── adapters.test.ts        # fixture → RawEntry[] snapshot
│   ├── pipeline.test.ts
│   └── rules.test.ts           # accuracy thresholds on labeled set
├── docs/SOURCES.md
└── .github/workflows/
    ├── collect.yml             # hourly data job
    └── ci.yml                  # typecheck + tests on code pushes (paths-ignore: data/**)
```

### Structure Rationale

- **`config/` separate from `collector/`:** tuning rules/sources is the most frequent change; isolating it makes PR diffs readable and lets tests import the same rules production uses.
- **`src/shared/` inside `src/`:** Next.js resolves it natively; collector reaches it through the `@/shared/*` path alias (tsx honours tsconfig `paths`). Shared code must stay framework-free (no `next/*`, no `node:fs`) so both runtimes can import it.
- **`data/` vs `public/data/`:** commit only canonical data; derive client views at build. Avoids committing the same bytes twice (git growth) and lets you change view shapes without a data migration.
- **`src/lib/views.ts` is shared:** the same selector (e.g. `selectTrending(items, now)`) runs in build-views and in Server Components, so "Em alta" on the pre-rendered HTML and in the client JSON can never disagree.

## Architectural Patterns

### Pattern 1: Adapter registry + declarative source config

**What:** Each source is data; each *kind* of source is code. The orchestrator loops over config and dispatches to `adapters[source.kind]`.
**When:** Always — 20+ sources, 5 kinds.
**Trade-offs:** Custom HTML sites still need per-site extractor code, but they plug into the same contract.

```typescript
// src/shared/schema.ts (excerpt)
export type SourceKind = 'rss' | 'json-hf-papers' | 'arxiv' | 'html' | 'sitemap';

// config/sources.ts
export interface SourceConfig {
  id: string;                 // 'openai-news' — stable, used in item.sourceId and health
  name: string;               // display
  company: Company;           // 'OpenAI' | 'Anthropic' | 'Google' | … | 'Community'
  group?: string;             // 'google' — sources counted once for multi-source coverage
  kind: SourceKind;
  url: string;
  weight: number;             // 0–1, feeds scoring
  enabled: boolean;
  optional?: boolean;         // Reddit: failures never count toward "all failed", shown as "instável"
  timeoutMs?: number;         // default 15000
  maxItems?: number;          // per run cap (arXiv)
  include?: RegExp[];         // keep only matching titles/categories (github.blog, about.fb.com)
  exclude?: RegExp[];
  extractor?: 'anthropic' | 'meta-ai';  // for kind 'html'
}

// collector/adapters/index.ts
export type Adapter = (src: SourceConfig, ctx: FetchCtx) => Promise<AdapterResult>;
export type AdapterResult =
  | { status: 'ok'; entries: RawEntry[]; etag?: string; lastModified?: string }
  | { status: 'not-modified' };
```

### Pattern 2: Failure isolation with "last-good by construction"

**What:** Never replace a source's items with its latest response; **merge** new entries into the previous dataset. A failing source simply contributes nothing new, so its previous items survive until they age out of the 30-day window. Health is tracked separately.
**When:** Core Value requirement.

```typescript
// collector/run.ts (shape)
const results = await Promise.allSettled(
  enabled.map(src => limit(() => runAdapter(src, ctx)))   // p-limit ~6 concurrent; per-host politeness
);
// runAdapter wraps: AbortSignal.timeout(src.timeoutMs) + retry (2x, backoff 1s/3s, only on network/5xx/429)
// then filters with include/exclude and caps maxItems.

const health = results.map((r, i) => toHealth(sources[i], r, prevState[sources[i].id], now));
const fresh  = results.flatMap(r => r.status === 'fulfilled' && r.value.status === 'ok' ? r.value.entries : []);

const required = health.filter(h => !h.optional);
if (required.every(h => h.status === 'error')) process.exit(1);   // don't commit; LIVE goes stale honestly
```

Health record per source (in `meta.json`, mirrored in `state/sources.json`):
`{ id, status: 'ok'|'not-modified'|'error'|'disabled', lastAttemptAt, lastSuccessAt, consecutiveFailures, lastError?: {kind:'timeout'|'http'|'parse'|'empty', httpStatus?, message}, itemsFetched, itemsNew }`.

Add an **"empty" error**: an HTML extractor that suddenly returns 0 items is a broken selector, not "no news" — treat as error so the status page shows it.

### Pattern 3: Pure pipeline with injected `now` and rules

**What:** Every stage after fetch is `(items, rules, now) → items`. No `Date.now()`, no fs, no network inside stages.
**When:** Always — this is what makes scoring/classification testable with fixtures and reproducible from git history.

```typescript
export function scoreItem(item: Item, ctx: { cluster: Cluster; now: Date }, r: ScoringRules): ScoredItem {
  const parts = {
    source: r.sourceWeight[item.sourceId] * r.sourceMax,                // e.g. 0–35
    boosts: sumMatches(item, r.boosts),                                  // launch/model/api/open-source
    coverage: Math.min(ctx.cluster.distinctGroups - 1, 3) * r.perExtraSource,
    penalties: -sumMatches(item, r.penalties),                           // jobs/events/customer stories
    decay: decayFactor(hoursBetween(item.publishedAt, ctx.now), r.halfLifeHours),
  };
  const raw = (parts.source + parts.boosts + parts.coverage + parts.penalties) * parts.decay;
  return { ...item, score: clamp(Math.round(raw), 0, 100), scoreBreakdown: parts };
}
```

Store `scoreBreakdown` (small object) — makes rule tuning explainable and debuggable from the JSON alone; can be shown as a tooltip.

**Recompute classify + score for the whole window every run** (cheap: a few thousand items, milliseconds). This means rule changes apply retroactively on the next run and age decay stays current. Only archive records freeze their score at write time.

### Pattern 4: Rules as data, verified by fixture tests

- `config/rules/*.ts` contain only data (arrays of `{ pattern: RegExp, weight, field: 'title'|'excerpt'|'url' }`).
- Three test layers (Vitest):
  1. **Adapter snapshot tests:** `tests/fixtures/feeds/openai.xml` → `RawEntry[]` snapshot. Re-record fixtures with a `npm run fixtures:refresh` script when a source changes (and that diff is the early warning a scraper broke).
  2. **Golden labeled set:** `labeled-titles.json` (real titles + expected primary category + `isHighlight`). Test asserts e.g. primary-category accuracy ≥ 85% and zero false "Destaque" on a must-not list (job posts, webinars). Rule changes that regress fail CI.
  3. **Property/edge tests:** canonical URL (utm, trailing slash, www, fragment, `?ref=`), date parsing (RFC 822, ISO, missing → firstSeenAt, future → clamp), cluster must/must-not pairs.
- A `npm run collect:dry -- --fixtures` mode runs the whole pipeline against fixtures with a fixed `now` and writes to a temp dir → deterministic end-to-end test without network.

### Pattern 5: Two-tier deduplication / clustering

1. **Exact:** `id = sha1(canonicalUrl).slice(0,16)`. Same canonical URL from two feeds (e.g. Google AI blog + DeepMind RSS, or a Reddit post whose link is the original) collapses to one item; record extra sources in `item.alsoSeenIn[]`. For Reddit/TLDR/newsletter entries, extract the **outbound link** from the entry content and canonicalize it too — that is the highest-precision cross-source signal available.
2. **Fuzzy (story clusters for "Em alta"):** within a sliding 72h window only (~300–800 items → <400k pair comparisons, trivial; no MinHash/LSH needed):
   - normalize title: lowercase, strip punctuation/emoji, drop EN stopwords and boilerplate ("introducing", "announcing", "now available", "[R]", "[D]"), light stemming;
   - extract entities with `config/rules/entities.ts` (model/product names, versions like `gpt-5.1`, `gemini 3`);
   - link items if **shared outbound canonical URL**, OR **Jaccard(tokens) ≥ ~0.5**, OR **shared specific entity (with version) AND Jaccard ≥ ~0.25** (thresholds to tune on `cluster-cases.json`);
   - union-find over links → clusters; `clusterId` = id of the earliest member (stable across runs as long as that member stays in window).
   - Guard against "chaining" (A~B, B~C, A≁C making mega-clusters): cap cluster span at 72h and reject merges where the new item's similarity to the cluster's *lead* item is below the lower threshold.
3. **Coverage counts distinct `group`s, not sources:** Google DeepMind + Google AI + Google Research are one group; otherwise one Google launch looks like a 3-source "trend". Same for Meta's three feeds and multiple subreddits ("reddit" group).

**"Em alta"** = clusters with `distinctGroups ≥ 2` (at least one non-community group) and newest member < 36h, ranked by `distinctGroups * w + max(score)`. Pure selector in `src/lib/views.ts`.

### Pattern 6: Build-time render + client JSON fetch (hybrid)

| Need | Mechanism | Why |
|------|-----------|-----|
| First paint, SEO, share previews | Server Components read `data/*.json` via `lib/data.ts` at build | Instant, works without JS |
| Filters (empresa/categoria/período) synced to URL | Client component reads `useSearchParams`, filters `feed-7d.json` / `feed-30d.json` in memory | Static site has no server; filtering ≤ a few thousand items client-side is instant |
| LIVE indicator | Client polls `/data/meta.json` every 60s with `cache: 'no-store'`, computes `now - lastUpdated` in the browser | Static HTML is frozen at build time; the age must be computed client-side or it is always "fresh" |
| New items without reload | When polled `meta.lastUpdated` > the `lastUpdated` embedded in the page, refetch `feed-7d.json?v=<lastUpdated>` and show "N novos itens" banner (don't reflow the list under the user's thumb) | Vercel serves the new deployment's static files at the same URL; the query string defeats any intermediate/browser cache |
| History | `/historico` lists months (build-time, from archive dir); `/historico/[mes]` fetches `/data/archive/YYYY-MM.json` client-side with pagination | A month can be MBs; never inline it into HTML/RSC payload |

Do **not** pass the full 30-day array as props from a Server Component into a Client Component: it is serialized into the RSC payload inside the HTML, doubling page weight. Pre-render ~40 items; hydrate the rest from the JSON file.

Notes (verified): Vercel caches static files on its CDN "for the lifetime of the deployment" and does not allow bypassing the cache for static files; a new deployment serves new content. That is fine here because each data commit produces a new deployment. With `output: 'export'`, `next.config` `headers()` does not apply — put any custom `Cache-Control` for `/data/*` in `vercel.json` instead. `useSearchParams` in a statically rendered page must be inside a `<Suspense>` boundary or the build fails.

Recommendation: use `output: 'export'`. It enforces the "no server" constraint (no accidental Functions/ISR usage on Hobby) and keeps the site portable to GitHub Pages/Cloudflare Pages if Vercel Hobby ever becomes a problem.

## Data Model

```typescript
// src/shared/schema.ts (shape; implement with zod)
Item {
  id: string;                 // sha1(canonicalUrl)[0..16]
  url: string;                // canonical, what the "Abrir fonte" button uses
  title: string;              // original language
  excerpt?: string;           // plain text, ≤ 280 chars, HTML stripped (copyright: short snippet only)
  sourceId: string;           // 'openai-news'
  company: Company;
  publishedAt: string;        // ISO; from source, fallback firstSeenAt, clamped to ≤ now
  firstSeenAt: string;        // first run that saw it — never changes
  lastSeenAt: string;
  categories: Category[];     // multi-label
  primaryCategory: Category;
  score: number;              // 0–100 at meta.lastUpdated
  scoreBreakdown?: {...};
  isHighlight: boolean;
  clusterId: string;
  alsoSeenIn?: string[];      // other sourceIds with the same canonical URL
  kind?: 'post'|'paper'|'release'|'discussion';
}

Meta {
  schemaVersion: 1;
  lastUpdated: string;        // run finish time — drives LIVE
  run: { startedAt, durationMs, sourcesOk, sourcesError, itemsTotal, itemsNew };
  sources: SourceHealth[];
}

ArchiveRecord = Pick<Item, 'id'|'url'|'title'|'sourceId'|'company'|'publishedAt'|'primaryCategory'|'categories'|'score'|'clusterId'>
```

- **Routing to archive:** on every run, upsert each item into `archive/<YYYY-MM of publishedAt>.json` (slim record). Archive is never pruned; `items.json` is pruned at 30 days. Upsert (not "move on expiry") means the archive is complete even if a run is skipped, and history is browsable immediately.
- **`schemaVersion`** in meta and a tiny migration hook in `store.ts` — the data files will outlive several schema iterations.
- **Stable serialization:** sort items by `publishedAt desc, id`; fixed key order (build objects via the schema); `JSON.stringify(x, null, 0)` per item and **one item per line** inside the array. This makes git diffs line-oriented and small (only new/changed items appear), which keeps repo growth and delta compression healthy, and makes `git log -p data/items.json` a usable audit trail.
- **Atomic write:** write `*.tmp`, validate by re-reading + zod parse, then `rename`. Validate before touching any file; if validation fails, exit non-zero with nothing written.

### Size growth (estimates, LOW-MEDIUM confidence — measure in phase 2)

| Input | Est. new items/day |
|-------|-------------------|
| Official labs/blogs (≈12 feeds) | 10–25 |
| GitHub blog/changelog (filtered) + releases.atom | 5–15 |
| HF blog + HF Daily Papers | 15–30 |
| arXiv (capped) | 20–30 (cap) |
| TLDR AI, Latent Space | 5–15 |
| Reddit (4 subs, if reachable) | 50–100 |
| **Total** | **~100–200** |

- Item ≈ 500–700 bytes with 280-char excerpt and breakdown → **`items.json` ≈ 1.5–4 MB** at 30 days; gzip ≈ 4–5x smaller on the wire.
- Archive record ≈ 250–350 bytes → **≈ 1–2 MB per month**, ~15–25 MB/year total.
- Client views: `feed-7d.json` with a compact projection (no breakdown, short keys optional) ≈ 300–700 KB raw / ~100–150 KB gzipped — acceptable for mobile default. `feed-30d.json` loaded lazily only when the period filter exceeds 7 days.
- Git: 24 commits/day touching ~MBs of JSON. With line-per-item serialization the per-commit delta is small; GitHub packs deltas. Use `actions/checkout` default `fetch-depth: 1` in the workflow. Revisit only if clone size passes a few hundred MB (option then: move archive to a separate `data` branch or orphan-squash old history). Biggest lever if size hurts: drop/limit Reddit and keep arXiv capped.

## Data Flow

### Collector run (hourly)

```
cron (~:17) ─► checkout (depth 1) ─► npm ci ─► tsx collector/run.ts
   load config + data/items.json + state/sources.json
   ─► fetch all sources (allSettled, p-limit 6, timeout 15s, 2 retries, If-None-Match/If-Modified-Since)
   ─► normalize ─► merge(prev, fresh) ─► cluster(72h) ─► classify(all) ─► score(all, now)
   ─► prune(30d) + archive upsert ─► zod validate ─► atomic write data/**
   ─► exit 0 (≥1 required source ok) | exit 1 (all required failed / invalid)
─► if git diff --quiet data/ → stop   (meta.json always changes, so in practice always commits)
─► git commit as repo owner ─► git pull --rebase ─► git push
─► Vercel webhook ─► prebuild build-views ─► next build ─► deploy (~1–2 min)
```

### Browser

```
GET /  ─► static HTML (pre-rendered top 40 + Destaques + Em alta, embedded buildLastUpdated)
   ─► hydrate ─► fetch /data/feed-7d.json ─► apply URL filters ─► render
   ─► setInterval 60s: fetch /data/meta.json (no-store)
          age = now - meta.lastUpdated  → LIVE (< 90 min) | "atrasado"
          meta.lastUpdated > shown → banner "N novos" → refetch feed-7d.json?v=…
```

## GitHub Actions → Vercel: flow and concurrency

```yaml
# .github/workflows/collect.yml (shape)
on:
  schedule: [{ cron: '17 * * * *' }]   # off the :00 peak; cron is best-effort (5–30 min delays)
  workflow_dispatch:
concurrency:
  group: collect-data
  cancel-in-progress: false            # never kill a run mid-write; queue instead
permissions:
  contents: write
jobs:
  collect:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4  (node 22, cache npm)
      - run: npm ci
      - run: npx tsx collector/run.ts
      - name: commit
        run: |
          git config user.name  "<owner github username>"
          git config user.email "<owner id>+<username>@users.noreply.github.com"
          git add data/
          git diff --cached --quiet && exit 0
          git commit -m "data: $(date -u +%FT%H:%MZ)"
          git pull --rebase origin main && git push
```

Key decisions:
- **Concurrency group with `cancel-in-progress: false`:** prevents two runs (a delayed cron + a manual dispatch) from racing on `items.json`. GitHub keeps at most one pending run per group, which is exactly the desired coalescing.
- **`git pull --rebase` before push:** the owner may push code while a run is in flight. Data files are touched only by the bot, so the rebase is conflict-free; if it does conflict, fail the job (next hour retries) rather than force-push.
- **Vercel side coalesces too (verified):** if a build is running and more commits arrive, Vercel queues, then builds only the most recent commit and cancels the older queued ones. No action needed.
- **Code CI separate:** `ci.yml` uses `paths-ignore: ['data/**']` so hourly data commits don't burn CI.
- **Do not use `[skip ci]`** in data commit messages — the point of the commit is to deploy.
- **CRITICAL – Vercel Hobby commit-author check:** Vercel's KB states that on Hobby "only the account owner can trigger deployments", and community reports (2024–2026) show commits authored by `github-actions[bot]` being rejected ("Git author … must have access to the team on Vercel"). Therefore the bot commit must be **authored as the repo owner** (using the owner's GitHub noreply email, which is linked to the GitHub account Vercel is connected to). Fallback if that is still rejected: a **Vercel Deploy Hook** URL stored as an Actions secret and `curl -X POST`ed after push (deploy hooks build the latest commit of the branch regardless of author). Verify this in the very first deploy phase — it can silently break the whole "auto-update" promise. Whether public repos are treated differently was not confirmed (MEDIUM confidence).
- **Inactivity disable (60 days):** hourly commits keep the repo "active"; there is some community uncertainty whether bot-only activity counts. Owner-authored data commits sidestep that too. Optionally add a health check: a daily job that fails loudly (GitHub email) if `meta.lastUpdated` is > 6h old.

## Scaling Considerations

Users don't load the system — it's static on a CDN. "Scale" here is data volume and source count.

| Scale | Adjustments |
|-------|-------------|
| v1 (~20 sources, ≤200 items/day) | Everything above; single JSON files; in-memory O(n²) clustering in 72h window |
| 50+ sources / 500+ items/day | Split client feed by day (`feed/2026-10-06.json`) and lazy-load; cap Reddit/arXiv harder; per-host rate limiting |
| Large archive (years) | Year index file + monthly shards (already); move archive to separate branch if clone size bothers |

### Scaling Priorities

1. **First bottleneck:** client payload size on mobile (feed JSON). Fix: compact projection + 7d default + lazy 30d.
2. **Second bottleneck:** repo size from hourly JSON commits. Fix: line-per-item serialization, slim archive, then branch split if needed.

## Anti-Patterns

### Anti-Pattern 1: Replace-per-run storage
**What people do:** rebuild `items.json` from only what was fetched this run.
**Why it's wrong:** any timeout wipes that source's items from the site; firstSeenAt resets; clusters jump.
**Do this instead:** merge into previous dataset keyed by id; prune by age only.

### Anti-Pattern 2: Logic in adapters
**What people do:** score/classify/filter inside each adapter.
**Why it's wrong:** rules drift per source, untestable, impossible to re-score retroactively.
**Do this instead:** adapters only produce `RawEntry`; all judgement lives in pure pipeline stages driven by `config/rules`.

### Anti-Pattern 3: Server-relative "freshness" in static HTML
**What people do:** render "atualizado há 5 min" / LIVE at build time.
**Why it's wrong:** HTML is frozen; it will say "há 5 min" forever, and LIVE never turns into "atrasado" when the collector dies — the exact failure the indicator exists to reveal.
**Do this instead:** embed ISO timestamp; compute relative time and LIVE state in the browser from polled `meta.json`.

### Anti-Pattern 4: Committing derived views
**What people do:** collector also writes `public/data/feed-7d.json`, `trending.json`, etc. into git.
**Why it's wrong:** double git growth; views and canonical data can diverge; changing a view needs a data migration.
**Do this instead:** derive views in `prebuild` from `data/`.

### Anti-Pattern 5: Non-deterministic pipeline
**What people do:** `new Date()` and `Math.random()`-ordered `Object.keys` scattered through stages; unstable key order in output.
**Why it's wrong:** flaky tests, noisy diffs, can't reproduce a past ranking from git history.
**Do this instead:** inject `now`; sort output deterministically; stable key order.

### Anti-Pattern 6: Counting sources instead of independent groups
**What people do:** "covered by 3 sources" when all three are Google blogs or three subreddits.
**Why it's wrong:** "Em alta" and coverage boost get dominated by multi-feed companies and Reddit cross-posts.
**Do this instead:** `group` field in source config; coverage = distinct groups.

### Anti-Pattern 7: Exiting non-zero on any source failure
**Why it's wrong:** one flaky Reddit 429 stops the commit → whole site goes "atrasado".
**Do this instead:** exit 1 only when all required sources fail or validation fails; optional sources never count.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| RSS/Atom feeds | HTTP GET + feed parser, conditional GET | Send a descriptive User-Agent with repo URL; some sites block default Node UA |
| HF Daily Papers | JSON GET | Use as curated research signal; arXiv duplicates collapse via arXiv id canonicalization (`arxiv.org/abs/<id>` without version suffix) |
| arXiv | RSS/API with per-run cap | Respect 3s between API calls; canonicalize `abs/2510.01234v2` → `abs/2510.01234` |
| Anthropic / Meta AI | HTML + sitemap extraction | Fragile; treat 0 results as error; fixture snapshot tests detect layout changes |
| Reddit | RSS, optional | Datacenter IP blocks/429 likely; `optional: true`, low weight |
| GitHub | Actions + `contents: write` token | Owner-authored commits for Vercel Hobby |
| Vercel | Git integration (fallback: Deploy Hook) | Queued-build coalescing is automatic |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| config ↔ collector | TS import | Config is data only |
| adapters ↔ pipeline | `RawEntry[]` + `AdapterResult` | The only contract adapters must honour |
| collector ↔ site | Files in `data/` validated by shared zod schema | Never import collector code into the site or vice versa |
| site build ↔ browser | `public/data/*.json` + HTML | Client views are versioned implicitly by deployment |
| shared ↔ everything | `src/shared/schema.ts` | Framework-free; changing it requires running both test suites |

## Suggested Build Order

Dependencies drive the order: schema → collector core → end-to-end deploy loop (to de-risk platform issues early) → breadth of sources → intelligence → UI richness.

1. **Foundations:** repo scaffold (Next + TS + Tailwind, single package), `src/shared/schema.ts`, constants, `config/sources.ts` skeleton, Vitest, tsx, path aliases. *Unblocks everything.*
2. **Collector core (walking skeleton):** `http.ts`, RSS adapter, normalize + canonical URL + id, merge, prune/archive, store (atomic, stable), orchestrator with allSettled + health + exit policy. 3–4 easy RSS sources (OpenAI, DeepMind, HF blog, Google AI). Fixture tests for these. *Core Value lives here.*
3. **Automation + deploy loop:** `collect.yml` (cron, concurrency, owner-authored commit, rebase-push), Vercel project, minimal page that lists items and shows `meta.lastUpdated` with client-side LIVE. **Verify a bot commit actually deploys on Hobby** (Deploy Hook fallback). *Highest platform risk — do it before investing in features.*
4. **Source breadth:** remaining RSS feeds with include filters (GitHub, Meta feeds), releases.atom, HF Daily Papers, arXiv with cap, Anthropic (sitemap + HTML), Meta AI HTML, Reddit optional. `docs/SOURCES.md` grows here. Each adapter lands with a fixture test.
5. **Intelligence:** classification rules + labeled set; dedupe/cluster with group-aware coverage; scoring with breakdown + decay; highlight rule. All pure, all fixture-tested. (Can partially overlap with 4 once ~8 sources exist to provide realistic data.)
6. **Site core:** build-views script, feed cards, URL-synced filters, Destaques, LIVE + "novos itens" banner, share/copy, dark mobile-first design system.
7. **Site secondary:** Em alta, Top da semana, `/fontes` status page, `/historico` (+ monthly client fetch).
8. **Hardening:** stale-data watchdog job, fixture refresh script, size check in CI (fail if `feed-7d.json` > budget), rule tuning against a week of real data.

Phases 1–3 should finish before any UI polish: if the hourly loop doesn't run unattended, nothing else matters (PROJECT.md Core Value).

## Sources

- Vercel – Deploying GitHub Projects (queued builds, most recent commit wins, `github.autoJobCancellation`): https://vercel.com/docs/git/vercel-for-github — HIGH
- Vercel – CDN Cache (static files cached for deployment lifetime; cache bypass for static files not allowed): https://vercel.com/docs/caching/cdn-cache — HIGH
- Vercel KB – Why aren't commits triggering deployments (Hobby: only account owner can trigger deployments): https://vercel.com/kb/guide/why-aren-t-commits-triggering-deployments-on-vercel — HIGH
- Vercel Community – Commits not triggering deployments on Hobby (2024 enforcement): https://community.vercel.com/t/commits-not-triggering-deployments-on-hobby-account/1130 — MEDIUM
- Karan Krishnani – Deploying to Vercel from any GitHub account on Hobby (Feb 2026, author rewrite workaround): https://karankrishnani.com/blog/deploying-to-vercel-from-any-github-account-on-the-hobby-plan — MEDIUM
- GitHub Docs – Workflow syntax, `concurrency`: https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions — HIGH
- RunsOn – Concurrency and cancel-in-progress: https://runs-on.com/github-actions/concurrency/ — MEDIUM
- Project context: `.planning/PROJECT.md` (verified source URLs, platform constraints)
- Clustering thresholds, size estimates, and item-volume numbers: engineering estimates (LOW-MEDIUM) — validate with one week of real collector output

---
*Architecture research for: scheduled-collector + static-site AI news aggregator*
*Researched: 2026-10-06*
