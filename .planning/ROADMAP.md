# Roadmap: AI Intelligence Hub

## Overview

The hub is two programs sharing one schema: an hourly GitHub Actions collector that commits JSON to the repo, and a fully static Next.js site on Vercel that rebuilds on every data commit. The roadmap first proves the whole delivery loop end-to-end with a trivial collector (retiring the Vercel Hobby bot-commit risk), then makes the official-source feed trustworthy, broadens sources, adds the PT-BR design and reading experience, layers the rule-based intelligence (categories, clustering, scoring) together with the UI that surfaces it, and finishes with history and landing pages, SEO and accessibility, and operational hardening. Each phase ships something visible on the live `*.vercel.app` site.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Walking Skeleton** - Scheduled cron -> owner-authored data commit -> Vercel production deploy -> live page showing new `lastUpdated`, with the full shared schema defined
- [ ] **Phase 2: Trustworthy Official-Source Feed** - Resilient RSS ingestion with safe dates, merge-not-replace storage, exact dedupe and a basic day-grouped feed
- [ ] **Phase 3: Full Source Coverage & Transparency** - All verified sources (gated feeds, releases, HF Papers, arXiv, Anthropic, Meta RSS, optional Reddit), probed from a runner, documented and shown on `/fontes`
- [ ] **Phase 4: Design System & Reading Experience** - Distinctive PT-BR dark mobile-first layout, designed states, "N novidades" pill, share, "novo desde sua última visita" and "Copiar pauta"
- [ ] **Phase 5: Categories, Companies & Filters** - Rule-based 13-category classifier and company entity dictionary, with URL-synced filters and text search
- [ ] **Phase 6: Story Clustering & Em alta** - Cross-source 72h clustering ("+N fontes", official source as primary) and the "Em alta" section
- [ ] **Phase 7: Scoring, Destaques & Explainability** - 0-100 rule score with breakdown, major-launch Destaques, Top da semana, full card and "Por que 82?", guarded by a golden set in CI
- [ ] **Phase 8: History & Landing Pages** - Monthly history, category/company landing pages, daily digest and `/sobre`
- [ ] **Phase 9: SEO, Accessibility & Payload Budget** - Metadata/canonical/OG/sitemap, safe structured data, the hub's own RSS, WCAG 2.2 AA and a CI payload budget
- [ ] **Phase 10: Operational Hardening** - Stale-data watchdog with auto-issues, fixture refresh, size alarms and runbook

## Phase Details

### Phase 1: Walking Skeleton

**Goal**: A scheduled (not manual) GitHub Actions run commits data as the repo owner and the Vercel production site visibly updates, with the complete shared schema in place so no later phase needs a data migration.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: PIPE-01, PIPE-02, PIPE-03, PIPE-04, PIPE-05, PIPE-06, DATA-01, DATA-07, DATA-08, FEED-06
**Success Criteria** (what must be TRUE):

  1. Without anyone touching a computer, a scheduled hourly run (off-minute cron) commits changed data plus `meta.json` to `main` of the owner's public personal repo, and that commit produces a Vercel production deployment (Hobby author check passes)
  2. Opening the live `*.vercel.app` page shows a "última atualização" time that advances after the next scheduled run, and a LIVE / "atrasado" / "parado" badge computed in the browser from `lastSuccessAt` that refreshes by polling `meta.json` without reload
  3. Triggering a manual run while a scheduled run is in progress yields two clean sequential commits with valid JSON (no lost or corrupted data)
  4. The committed `items.json` and `meta.json` validate against the shared zod schema, which already includes `publishedAt`/`datePrecision`/`firstSeenAt`, cluster fields, `scoreBreakdown`, `schemaVersion`, `lastRunAt`/`lastSuccessAt` and per-source health
  5. A code-change PR runs typecheck, lint and tests and fails if any route becomes dynamic; data-only commits skip CI

**Plans:** 6/8 plans executed

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Toolchain scaffold (Next 16/TS 6/Tailwind 4/ESLint 9/Vitest 5), static PT-BR shell, static-route guard (package legitimacy checkpoint)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Full shared zod schema, stable serializer, build-views, page renders status panel + up to 50 items / empty state
- [x] 01-03-PLAN.md — collect.yml (cron, concurrency, owner-identity commit, rebase-retry), ci.yml, vercel.json main-only, README ops note

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-04-PLAN.md — OpenAI RSS collector: fetch/parse/normalize, idempotent merge, meta health, atomic write-if-changed
- [x] 01-05-PLAN.md — LIVE/atrasado/parado client island polling /data/meta.json

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-06-PLAN.md — Create public repo + Vercel project ai-intelligence-hub-br, @devops push, first live deploy

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 01-07-PLAN.md — Runner probe: first bot data commit deploys; owner checks live page

**Wave 6** *(blocked on Wave 5 completion)*

- [ ] 01-08-PLAN.md — D-11 proof: 2 scheduled runs + concurrency test + owner sign-off

**UI hint**: yes
**Research flag**: Empirical Vercel Hobby test - prove owner-noreply-authored bot commits deploy from a *scheduled* run before any feature work; test Deploy Hook / Vercel CLI only if owner identity fails. Also confirm 60-day workflow keepalive assumption.

### Phase 2: Trustworthy Official-Source Feed

**Goal**: The live site shows a reverse-chronological feed of real items from all verified official RSS sources, and no single failing source, bad date or duplicate URL can corrupt it.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: COLL-01, COLL-09, COLL-10, COLL-11, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, INTL-01, FEED-01
**Success Criteria** (what must be TRUE):

  1. User sees items from OpenAI, Google DeepMind/AI/Research, Microsoft AI/Research/Foundry, Hugging Face blog, GitHub blog/changelog, TLDR AI and Latent Space, grouped by day with "Carregar mais", each opening the original URL with plain-text title and excerpt (no HTML, ≤280 chars)
  2. When one source times out or returns garbage, the run still succeeds, that source keeps its previous items, and `meta.json` records its error kind; a parser returning zero items is recorded as `empty`/`parser_contract`, not ok
  3. Items without a date never appear as "now", date-only items don't shift a day, future dates are clamped, and a newly added source's old posts land as backfill rather than flooding the top
  4. The same article reached via utm-tagged, trailing-slash or www variants (including aggregator outbound links) appears once
  5. Items older than 30 days leave `items.json` and are found in the matching `archive/AAAA-MM.json`, which is never overwritten

**Plans**: TBD
**UI hint**: yes

### Phase 3: Full Source Coverage & Transparency

**Goal**: Every verified source in PROJECT.md is collected responsibly from a GitHub runner, and the user can see which sources are healthy and what each one's limitations are.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: COLL-02, COLL-03, COLL-04, COLL-05, COLL-06, COLL-07, COLL-08, COLL-12, OPS-01, DISC-04
**Success Criteria** (what must be TRUE):

  1. The feed includes Anthropic news (sitemap discovery + semantic HTML), HF Daily Papers, capped arXiv `new` papers, meaningful AI SDK GitHub releases and Meta via its public RSS feeds; mixed-topic feeds (github.blog, about.fb.com, news.microsoft.com, engineering.fb.com) contribute only AI-relevant posts
  2. Every enabled source URL has a recorded successful probe from a GitHub runner; arXiv is fetched at most 1-2x/day with ≥3 s spacing and a daily cap
  3. Reddit stays disabled unless the runner probe succeeds, and even when enabled its failures never trigger "all sources failed"
  4. User can open `/fontes` and see each source's status, last success, method and documented limitation (including The Batch, Reddit and Meta AI), matching `docs/SOURCES.md`

**Plans**: TBD
**UI hint**: yes
**Research flag**: Probe every source from a real GitHub runner (datacenter IP), confirm Anthropic page/sitemap structure and TLDR item shape, verify arXiv volume under the cap.

### Phase 4: Design System & Reading Experience

**Goal**: The site looks distinctive and feels calm to read daily: PT-BR, dark, mobile-first, with non-disruptive updates and quick ways to share or collect items for content.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: UI-01, UI-02, UI-03, FEED-07, FEED-08, FEED-10, FEED-11
**Success Criteria** (what must be TRUE):

  1. On a phone the feed renders as a dark, mobile-first, coded-visual (SVG/CSS, no thumbnails or AI images) layout with all UI text in PT-BR and English news tagged `lang="en"`
  2. Empty, loading and error states (e.g. no results, data unavailable) show designed PT-BR messages
  3. When new items arrive while reading, an "N novidades" pill appears and the list never reorders until the user taps it
  4. User can share an item (title + link + source) via Web Share or clipboard, and select several items to copy as a single "pauta" list
  5. Returning visitors see items new since their last visit marked, with no account (browser storage only)

**Plans**: TBD
**UI hint**: yes

### Phase 5: Categories, Companies & Filters

**Goal**: Every item carries rule-based categories and a company, and the user can narrow the feed to exactly what they care about with shareable URLs.
**Mode:** mvp
**Depends on**: Phase 3, Phase 4
**Requirements**: INTL-03, INTL-04, FEED-03, FEED-04
**Success Criteria** (what must be TRUE):

  1. Each card shows a primary category plus secondary labels from the 13 categories, without obvious keyword collisions (word-boundary/co-occurrence rules)
  2. Each item shows the right company, derived from source and text mentions through one shared entity dictionary
  3. User can filter by company, category and period; the URL updates and pasting it in another browser reproduces the same view
  4. User can search titles and excerpts by text and combine search with filters

**Plans**: TBD
**UI hint**: yes
**Research flag**: Classification rules tuned against real collected data from Phases 2-3.

### Phase 6: Story Clustering & Em alta

**Goal**: The same story from several publishers appears once with "+N fontes", and the user can see what many sources are covering right now.
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: INTL-02, DISC-01
**Success Criteria** (what must be TRUE):

  1. A launch covered by the official lab, TLDR AI and Latent Space within 72h appears as one card led by the official source, with "+N fontes" listing the others
  2. Similar-but-different stories (e.g. different model versions) stay separate; clustering never deletes items
  3. User sees an "Em alta" section listing stories covered by several distinct publishers recently

**Plans**: TBD
**UI hint**: yes
**Research flag**: Similarity thresholds and version-token guards tuned on real data; seed the known-pairs file.

### Phase 7: Scoring, Destaques & Explainability

**Goal**: The user immediately sees the big launches and the most relevant stories, and can understand why each item scored what it did.
**Mode:** mvp
**Depends on**: Phase 6
**Requirements**: INTL-05, INTL-06, INTL-07, FEED-02, FEED-05, FEED-09, DISC-02
**Success Criteria** (what must be TRUE):

  1. User sees a Destaques section with at most ~4 major launches (new model/API/product from major labs) from the last 48h; it is never empty and never contains arXiv items
  2. Every card shows title, source, company, relative time, categories, a relevance chip, "+N fontes" when clustered and an open-original button (new tab)
  3. User can open "Por que 82?" on any item and see the score breakdown (source weight, boosts, coverage, age decay, penalties); scores visibly decay as items age across runs
  4. User sees "Top da semana" with the 10 highest-scoring clusters of the last 7 days
  5. CI fails if classification, clustering or scoring regress against the golden labeled set (~80-100 items) and known-pairs file; `collect:dry --fixtures` runs the full pipeline offline

**Plans**: TBD
**UI hint**: yes
**Research flag**: Score weights, decay and penalties tuned on at least several days of real data.

### Phase 8: History & Landing Pages

**Goal**: The user can go back in time and land directly on a category, company or day, and anyone can learn what the project is and how to request takedown.
**Mode:** mvp
**Depends on**: Phase 7
**Requirements**: DISC-03, DISC-05, DISC-06, DISC-07
**Success Criteria** (what must be TRUE):

  1. User can browse `/historico` and open `/historico/[mes]` to see that month's archived items
  2. User can open `/categoria/[slug]` and `/empresa/[slug]` pages listing the matching items
  3. User can open `/dia/AAAA-MM-DD` and see that day's digest
  4. User can open `/sobre` with the project explanation and a takedown contact

**Plans**: TBD
**UI hint**: yes

### Phase 9: SEO, Accessibility & Payload Budget

**Goal**: The site is discoverable, policy-safe, accessible and fast, and stays that way as data grows.
**Mode:** mvp
**Depends on**: Phase 8
**Requirements**: SEO-01, SEO-02, SEO-03, SEO-04, UI-04
**Success Criteria** (what must be TRUE):

  1. Every page has metadata, a canonical URL from a single `SITE_URL`, a coded OG image, and appears in `sitemap.xml`/`robots.txt`; filter-combination URLs are noindex or canonicalized
  2. Structured data uses only `WebSite`/`CollectionPage`/`ItemList` (no `NewsArticle`), validated by a rich-results test
  3. A user can subscribe to the hub's own RSS feed in a feed reader
  4. Keyboard and screen-reader users can operate filters (aria-pressed chips), see focus, and get information not conveyed by color only; contrast passes AA and reduced motion is respected
  5. CI fails when page payload exceeds the size budget or the 30-day file enters the RSC payload

**Plans**: TBD
**UI hint**: yes

### Phase 10: Operational Hardening

**Goal**: The hub keeps itself healthy unattended: problems surface as GitHub issues before the owner notices, and fixing them is documented.
**Mode:** mvp
**Depends on**: Phase 3 (can run after Phase 9 in sequence)
**Requirements**: OPS-02, OPS-03, OPS-04, OPS-05
**Success Criteria** (what must be TRUE):

  1. When data goes stale or a source stays down beyond the threshold, a GitHub issue is opened automatically (and not duplicated)
  2. Running one script refreshes test fixtures from live sources
  3. An alert fires when `items.json` or repo size crosses its threshold
  4. The owner can follow the runbook to re-enable a disabled workflow, repair a broken scraper and tune rules

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10
(Phase 4 depends only on Phase 2 and Phase 10 only on Phase 3, so they may run earlier if parallelized.)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Walking Skeleton | 6/8 | In Progress|  |
| 2. Trustworthy Official-Source Feed | 0/TBD | Not started | - |
| 3. Full Source Coverage & Transparency | 0/TBD | Not started | - |
| 4. Design System & Reading Experience | 0/TBD | Not started | - |
| 5. Categories, Companies & Filters | 0/TBD | Not started | - |
| 6. Story Clustering & Em alta | 0/TBD | Not started | - |
| 7. Scoring, Destaques & Explainability | 0/TBD | Not started | - |
| 8. History & Landing Pages | 0/TBD | Not started | - |
| 9. SEO, Accessibility & Payload Budget | 0/TBD | Not started | - |
| 10. Operational Hardening | 0/TBD | Not started | - |
