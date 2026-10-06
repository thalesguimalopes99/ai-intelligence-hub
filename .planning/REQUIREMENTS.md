# Requirements: AI Intelligence Hub

**Defined:** 2026-10-06
**Core Value:** O feed tem que estar sempre atualizado e confiável sozinho: coleta horária que nunca cai por causa de uma fonte com erro, sem duplicatas, e com o link certo para a fonte original.

## v1 Requirements

### Pipeline & Deploy (PIPE)

- [ ] **PIPE-01**: Collector runs automatically every hour on GitHub Actions (off-minute cron) and can also be triggered manually, with no local machine involved
- [ ] **PIPE-02**: Each run commits updated data to the repo only when data changed (plus `meta.json`), authored so that Vercel Hobby accepts the deploy
- [ ] **PIPE-03**: Every data commit produces a Vercel production deployment of the site automatically (proven with a scheduled, not manual, run)
- [ ] **PIPE-04**: Concurrent runs never corrupt data (concurrency group without cancel, rebase-and-retry push, idempotent merge)
- [ ] **PIPE-05**: Repo is public under the owner's personal GitHub account; only `main` deploys on Vercel
- [x] **PIPE-06**: A CI workflow runs typecheck, lint and tests on code changes (not on data-only commits) and fails if any route becomes dynamic

### Collection (COLL)

- [ ] **COLL-01**: RSS/Atom adapter ingests all verified RSS sources (OpenAI, Google DeepMind, Google AI, Google Research, Microsoft AI/Research/Foundry, Hugging Face blog, GitHub blog + changelog, TLDR AI, Latent Space)
- [ ] **COLL-02**: Mixed-topic feeds (github.blog, about.fb.com, news.microsoft.com, engineering.fb.com) pass an AI-relevance gate before ingestion
- [ ] **COLL-03**: GitHub Releases (Atom) are collected for a configured list of AI SDK repos, filtered to meaningful releases
- [ ] **COLL-04**: Hugging Face Daily Papers (JSON API) is collected as the primary research signal
- [ ] **COLL-05**: arXiv is collected with etiquette (≥3 s between requests, 1–2×/day, `announce_type=new` only) and capped per day; arXiv items never enter Destaques
- [ ] **COLL-06**: Anthropic news is collected via sitemap discovery + semantic HTML extraction (no hashed CSS classes), with capped article fetches for publish dates
- [ ] **COLL-07**: Meta is covered only via its public RSS feeds (engineering.fb.com, about.fb.com) — no scraping of ai.meta.com
- [ ] **COLL-08**: Reddit adapter (r/OpenAI, r/ClaudeAI, r/MachineLearning, r/LocalLLaMA) exists behind a disabled flag; it is enabled only if a probe from a GitHub runner succeeds, and never counts toward coverage boosts or the "all sources failed" rule
- [ ] **COLL-09**: Every source fetch has timeout, bounded retry (capped Retry-After), honest User-Agent, size cap and charset-safe decoding
- [ ] **COLL-10**: One source failing never stops the run or removes that source's existing items; the run exits non-zero only if all required sources fail or output validation fails
- [ ] **COLL-11**: A scraper/parser that suddenly returns zero items is recorded as an error (`empty`/`parser_contract`), not success
- [ ] **COLL-12**: Every source URL is verified by a real request (including from a GitHub runner) before being enabled; no invented feed URLs

### Data (DATA)

- [ ] **DATA-01**: All items are normalized to one zod-validated schema (id, title, canonical URL, source, company, `publishedAt`, `datePrecision`, `firstSeenAt`, excerpt, categories, cluster info, score breakdown, schemaVersion)
- [ ] **DATA-02**: Titles and excerpts are stored as plain text (HTML stripped, excerpt ≤280 chars); only http(s) URLs are accepted
- [ ] **DATA-03**: Dates are handled safely: missing dates are never stamped "now", date-only values don't shift by timezone, future dates are clamped, `publishedAt` is frozen once set
- [ ] **DATA-04**: A source's first run is treated as backfill so old posts don't flood highlights
- [ ] **DATA-05**: New data is merged into the previous dataset (never replaced); `items.json` keeps a 30-day window
- [ ] **DATA-06**: Items older than the window are preserved in upsert-only monthly archives (`archive/AAAA-MM.json`)
- [ ] **DATA-07**: `meta.json` records `lastRunAt`, `lastSuccessAt` and per-source health (status, last success, consecutive failures, error kind)
- [ ] **DATA-08**: Writes are atomic with stable serialization (minimal git diffs); a prebuild step derives compact client views into gitignored `public/data/`

### Intelligence (INTL)

- [ ] **INTL-01**: Exact duplicates are removed by canonical-URL hash (utm/trailing slash/www normalized), including outbound links found in aggregator items
- [ ] **INTL-02**: The same story covered by different sources is grouped into one cluster ("+N fontes") within a 72h window; similarity only groups, never deletes; the official source becomes the primary item
- [ ] **INTL-03**: Items are classified by rules into the 13 categories (Models, Agents, Coding, API, Automation, Prompt Engineering, Research, Image, Video, Audio, Business, Safety, Hardware), multi-label with a primary category, using word-boundary/co-occurrence rules to avoid collisions
- [ ] **INTL-04**: Company is assigned to each item from source and text mentions via a shared entity dictionary
- [ ] **INTL-05**: Each item gets a 0–100 relevance score from rules (source weight, launch/model/API/open-source boosts, multi-source coverage by distinct publisher, age decay, penalties for jobs/events/customer stories) with a stored breakdown; decay is recomputed every run
- [ ] **INTL-06**: Highlights are detected as major launches (new model/API/product from major labs) by rule
- [ ] **INTL-07**: Classification, clustering and scoring are covered by a golden labeled set (~80–100 items) and a known-pairs file in CI, plus a fixture-based dry-run mode

### Feed (FEED)

- [ ] **FEED-01**: User sees a reverse-chronological feed grouped by day, with "Carregar mais"
- [ ] **FEED-02**: Each card shows title, source, company, relative time, categories, relevance chip, "+N fontes" when clustered, and a button opening the original source in a new tab
- [ ] **FEED-03**: User can filter by company, category and period; filters live in the URL and are shareable
- [ ] **FEED-04**: User can search titles and excerpts by text
- [ ] **FEED-05**: User sees a Destaques section (major launches, last 48h, max ~4, never empty)
- [ ] **FEED-06**: User sees a LIVE indicator computed in the browser from `lastSuccessAt` (LIVE <90 min · "atrasado" 90–180 · "parado" >180) and the last update time, refreshed by polling `meta.json` without page reload
- [ ] **FEED-07**: When new items arrive while reading, user sees an "N novidades" pill; the list never reorders by itself
- [ ] **FEED-08**: User can copy/share an item (title + link + source) via Web Share or clipboard
- [ ] **FEED-09**: User can open "Por que 82?" to see the score breakdown
- [ ] **FEED-10**: Items new since the user's last visit are marked (stored in the browser, no account)
- [ ] **FEED-11**: User can select several items and copy them as a single "pauta" list

### Discovery pages (DISC)

- [ ] **DISC-01**: User sees "Em alta" (stories covered by several distinct publishers recently)
- [ ] **DISC-02**: User sees "Top da semana" (10 highest-scoring stories of the last 7 days, by cluster)
- [ ] **DISC-03**: User can browse history by month (`/historico`, `/historico/[mes]`)
- [ ] **DISC-04**: User can see a `/fontes` page with each source's status, method and documented limitations
- [ ] **DISC-05**: User can open indexable category and company pages (`/categoria/[slug]`, `/empresa/[slug]`)
- [ ] **DISC-06**: User can open a daily digest page (`/dia/AAAA-MM-DD`)
- [ ] **DISC-07**: User can find an `/sobre` page with project explanation and takedown contact

### Design (UI)

- [ ] **UI-01**: Interface is in PT-BR; news content stays in its original language and is tagged `lang="en"`
- [ ] **UI-02**: Layout is mobile-first, dark mode, modern and distinctive (coded visuals/SVG, no AI-generated images, no hotlinked thumbnails)
- [ ] **UI-03**: Empty, loading and error states are designed in PT-BR
- [ ] **UI-04**: Site meets WCAG 2.2 AA basics (contrast, focus, not color-only, aria-pressed chips, reduced motion)

### SEO & Distribution (SEO)

- [ ] **SEO-01**: Pages have metadata, canonical URLs (single `SITE_URL` env), coded OG images, `sitemap.xml` and `robots.txt`; filter-combination URLs are noindex/canonicalized
- [ ] **SEO-02**: Structured data uses `WebSite`/`CollectionPage`/`ItemList` only (no `NewsArticle` for third-party items)
- [ ] **SEO-03**: The hub publishes its own RSS feed
- [ ] **SEO-04**: Page payload stays within a size budget checked in CI (30-day file never shipped in the RSC payload)

### Operations & Docs (OPS)

- [ ] **OPS-01**: `docs/SOURCES.md` documents each source's method, verified URL, robots/ToS posture and limitations (incl. The Batch, Reddit, Meta AI)
- [ ] **OPS-02**: A watchdog detects stale data / long source outages and opens a GitHub issue automatically
- [ ] **OPS-03**: A script refreshes test fixtures from live sources
- [ ] **OPS-04**: Alerts exist for `items.json`/repo size growth
- [ ] **OPS-05**: A runbook covers re-enabling a disabled workflow, repairing a scraper and tuning rules

## v2 Requirements

- **V2-01**: Automatic headline translation to PT-BR using a free option (e.g. open-source model in the Action)
- **V2-02**: The Batch via headless browser (Playwright) if feasible
- **V2-03**: Custom domain (with 301s from `*.vercel.app`)
- **V2-04**: Local favorites (browser storage)
- **V2-05**: Entity/model tag pages (e.g. `/modelo/gpt-x`)
- **V2-06**: Keyboard shortcuts
- **V2-07**: Public JSON endpoint with CORS for third parties

## Out of Scope

| Feature | Reason |
|---------|--------|
| Chatbot / conversational assistant | Explicitly not wanted |
| Paid APIs (AI or data) | Zero-cost constraint |
| Database / custom backend | JSON in git is enough for v1 |
| User accounts, comments, votes | Static public site; adds moderation burden |
| Full article reproduction / per-article pages on our domain | Copyright + Google spam policy on scraped feeds |
| `NewsArticle` JSON-LD for third-party items | Structured-data policy violation |
| Hotlinked thumbnails / AI-generated images | Copyright, reliability; project rule |
| Scraping ai.meta.com | Meta's robots notice prohibits automated collection without permission |
| Proxies to bypass Reddit blocking | Violates Reddit policy |
| Infinite scroll without URL state; auto-inserting items | UX anti-patterns |
| Ads / affiliate links | Vercel Hobby is non-commercial |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PIPE-01 | Phase 1 | Pending |
| PIPE-02 | Phase 1 | Pending |
| PIPE-03 | Phase 1 | Pending |
| PIPE-04 | Phase 1 | Pending |
| PIPE-05 | Phase 1 | Pending |
| PIPE-06 | Phase 1 | Complete |
| COLL-01 | Phase 2 | Pending |
| COLL-02 | Phase 3 | Pending |
| COLL-03 | Phase 3 | Pending |
| COLL-04 | Phase 3 | Pending |
| COLL-05 | Phase 3 | Pending |
| COLL-06 | Phase 3 | Pending |
| COLL-07 | Phase 3 | Pending |
| COLL-08 | Phase 3 | Pending |
| COLL-09 | Phase 2 | Pending |
| COLL-10 | Phase 2 | Pending |
| COLL-11 | Phase 2 | Pending |
| COLL-12 | Phase 3 | Pending |
| DATA-01 | Phase 1 | Pending |
| DATA-02 | Phase 2 | Pending |
| DATA-03 | Phase 2 | Pending |
| DATA-04 | Phase 2 | Pending |
| DATA-05 | Phase 2 | Pending |
| DATA-06 | Phase 2 | Pending |
| DATA-07 | Phase 1 | Pending |
| DATA-08 | Phase 1 | Pending |
| INTL-01 | Phase 2 | Pending |
| INTL-02 | Phase 6 | Pending |
| INTL-03 | Phase 5 | Pending |
| INTL-04 | Phase 5 | Pending |
| INTL-05 | Phase 7 | Pending |
| INTL-06 | Phase 7 | Pending |
| INTL-07 | Phase 7 | Pending |
| FEED-01 | Phase 2 | Pending |
| FEED-02 | Phase 7 | Pending |
| FEED-03 | Phase 5 | Pending |
| FEED-04 | Phase 5 | Pending |
| FEED-05 | Phase 7 | Pending |
| FEED-06 | Phase 1 | Pending |
| FEED-07 | Phase 4 | Pending |
| FEED-08 | Phase 4 | Pending |
| FEED-09 | Phase 7 | Pending |
| FEED-10 | Phase 4 | Pending |
| FEED-11 | Phase 4 | Pending |
| DISC-01 | Phase 6 | Pending |
| DISC-02 | Phase 7 | Pending |
| DISC-03 | Phase 8 | Pending |
| DISC-04 | Phase 3 | Pending |
| DISC-05 | Phase 8 | Pending |
| DISC-06 | Phase 8 | Pending |
| DISC-07 | Phase 8 | Pending |
| UI-01 | Phase 4 | Pending |
| UI-02 | Phase 4 | Pending |
| UI-03 | Phase 4 | Pending |
| UI-04 | Phase 9 | Pending |
| SEO-01 | Phase 9 | Pending |
| SEO-02 | Phase 9 | Pending |
| SEO-03 | Phase 9 | Pending |
| SEO-04 | Phase 9 | Pending |
| OPS-01 | Phase 3 | Pending |
| OPS-02 | Phase 10 | Pending |
| OPS-03 | Phase 10 | Pending |
| OPS-04 | Phase 10 | Pending |
| OPS-05 | Phase 10 | Pending |

**Coverage:**
- v1 requirements: 64 total
- Mapped to phases: 64
- Unmapped: 0

---
*Requirements defined: 2026-10-06*
*Last updated: 2026-10-06 after roadmap creation*
