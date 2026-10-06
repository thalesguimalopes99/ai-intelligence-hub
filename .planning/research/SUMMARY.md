# Project Research Summary

**Project:** AI Intelligence Hub
**Domain:** Serverless AI-news aggregator (hourly GitHub Actions collector → JSON in git → static Next.js site on Vercel Hobby, PT-BR UI)
**Researched:** 2026-10-06
**Confidence:** MEDIUM-HIGH

## Executive Summary

Two programs, one repo. A Node/TS collector runs hourly on GitHub Actions, fetches ~20 sources (RSS/Atom, JSON, two HTML scrapers), normalizes into one zod schema, merges into the previous dataset, clusters duplicates, classifies, scores and commits JSON. A fully static Next.js 16 site on Vercel reads that JSON at build time and hydrates small client islands (filters, LIVE badge, share). They share only a schema and files in git. The pipeline is pure and fixture-tested (adapters produce raw entries; all judgement lives in rule-driven pure stages), and storage is merge-not-replace, so a failing source can never erase its items or kill the run — this is the Core Value.

**Recommended approach:** Node 24 LTS, Next 16.3, React 19.3, **TypeScript pinned ~6.0.x** (7.x is npm `latest` but breaks Next type-checking), Tailwind 4.3, zod 4 shared by both sides; collector on tsx + ky + feedsmith + cheerio + normalize-url + p-limit + hand-rolled token similarity. Cross-source clustering ("+N fontes") is what makes an aggregator; cluster and score-breakdown fields must be in the schema from Phase 1. Home page = ~40 prerendered cards + Destaques (cap ~4) + slim 7-day client JSON; never ship the 30-day file in the RSC payload.

**Top risk — Vercel Hobby may refuse to deploy bot-authored commits.** The collector would look healthy while the site never updates. Mitigation: author data commits as the repo owner's GitHub noreply identity; Deploy Hook / Vercel CLI as *unverified* fallbacks. **Phase 1 must prove the whole loop end-to-end** (scheduled cron → commit → Vercel production deploy → site shows new `lastUpdated`) with a trivial collector before any feature work. Other major risks: silent-zero scrapers, date handling/backfill pollution, arXiv volume (~400/day), keyword collisions, dedupe false positives.

## Conflicts Between Researchers — Resolved

| # | Conflict | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Rendering: `output: 'export'` (ARCH) vs default `next build`, all static (STACK) | **Default `next build` on Vercel, every route static, export-compatible code** (no server actions/cookies/headers()/ISR) + CI check failing if any route becomes dynamic | Export ignores `next.config` `headers()`; static output already costs zero functions; flipping to export later is one line |
| 2 | Data location: committed `data/` + prebuild → `public/data` (ARCH) vs collector writes `public/data` (STACK) | **Canonical `data/` committed by bot; `scripts/build-views.ts` as `prebuild` generates gitignored `public/data/`** | Client needs compact projections; shared selectors in `src/lib/views.ts` keep HTML and client JSON consistent; avoids doubling git growth. Workflow commits only `data/**`; `ci.yml` uses `paths-ignore: data/**` |
| 3 | Reddit: user chose 4 subreddits vs PITFALLS "off" (robots `Disallow: /`, datacenter IP blocks, OAuth closed to new apps since Nov 2025) | **USER DECISION** — options: (a) off in v1; (b) adapter behind `enabled:false`, enabled only if a runner probe passes, never counted in coverage or "all failed"; (c) drop. No proxies. | Do not silently drop the user's choice |
| 4 | Meta AI: `ai.meta.com/robots.txt` notice prohibits automated collection without permission | **USER DECISION** — recommended: Meta RSS (`engineering.fb.com/feed/`, `about.fb.com/news/feed/` + AI gate) as primary; `ai.meta.com/blog` scrape optional/off by default | Respect stated ToS while keeping coverage |

Also resolved: use STACK versions (`checkout@v7`, `setup-node@v7`, Node 24). LIVE thresholds: **LIVE < 90 min · "atrasado" 90–180 · "parado" > 180**, from `lastSuccessAt`; poll `meta.json` every 60–120 s.
Open: whether Deploy Hook / CLI deploys bypass the Hobby author check (researchers disagree) — test in Phase 1 only if owner-identity fails.

## Key Findings

### Recommended Stack (see STACK.md)
- **Node.js 24 LTS** everywhere (Vercel deprecated Node 20 on 2026-10-01; 26 not LTS).
- **Next.js 16.3.x + React 19.3**, App Router, all routes static.
- **TypeScript ~6.0.3** — pin right after scaffold; list `node` in `types`.
- **Tailwind 4.3** CSS-first `@theme`, dark only.
- **zod 4** shared schema.
- Collector: tsx, ky (cap `maxRetryAfter`), feedsmith 3, cheerio, fast-xml-parser, normalize-url, p-limit, node:crypto. Avoid rss-parser, string-similarity (deprecated), axios, moment, Playwright (v1).
- Vitest 5 + real fixtures; date-fns 4 + @date-fns/tz (`America/Sao_Paulo`); UTC ISO in storage.
- Actions: cron `17 * * * *`, `concurrency` w/ `cancel-in-progress: false`, `git-auto-commit-action@v7`, separate `ci.yml`.

### Expected Features (see FEATURES.md)
**Table stakes:** reverse-chron feed grouped by day, outbound links, plain-text excerpts ≤280 chars, client-side relative time; **cross-source clustering ("+N fontes")** with official source as primary; URL-synced filters + **text search** (missing from PROJECT.md); Destaques (48h, cap ~4, never empty), Em alta, Top da semana (by cluster), monthly history; client-side LIVE + non-disruptive "N novidades" pill (never reorder under the user); `/fontes` status page; copy/share (Web Share → clipboard); SEO baseline (metadata, canonical, coded OG, sitemap, robots); WCAG 2.2 AA; PT-BR empty/error states.
**Differentiators:** explainable score ("Por que 82?") with stored `scoreBreakdown` + 3-level relevance chip; the hub's own RSS output; public JSON endpoint; source-health indicator; `lang="en"` on English titles.
**v1.x:** `/categoria/*` and `/empresa/*` landing pages, "novo desde sua última visita", multi-select "Copiar pauta", entity tags, `/dia/AAAA-MM-DD`, keyboard shortcuts.
**Defer v2+:** headline translation, favorites, The Batch via Playwright, custom domain (use `SITE_URL` env from day one).
**Anti-features:** per-article pages on our domain, `NewsArticle` JSON-LD for third-party items, hotlinked thumbnails, auto-inserting items, infinite scroll without URL state, LIVE that stays green when stale, unbounded arXiv.

### Architecture Approach (see ARCHITECTURE.md)
One `package.json`, no workspaces. One-directional flow: sources → collector → `data/` (git) → prebuild → `public/data` + static HTML → browser.
1. **Shared schema** `src/shared/schema.ts` (Item, Meta, SourceHealth, Cluster).
2. **Source registry + rules** `config/sources.ts`, `config/rules/*` (data only; one entity dictionary feeds classifier, boosts, Destaques, tags).
3. **Adapters** `collector/adapters/*` → `RawEntry[]`, no judgement; HTML extractor returning 0 items = error.
4. **Pure pipeline** normalize → merge → cluster → classify → score → prune, `(input, rules, now)`; reclassify/rescore whole window every run.
5. **Store + orchestrator**: atomic, stable serialization, zod-validated before write; exit non-zero only if all required sources fail or validation fails; archive upsert-only.
6. **build-views + Next app**: prebuild derives client JSON; Server Components render top 40; client islands for filters (`useSearchParams` in `<Suspense>`), LIVE poll, share.

### Critical Pitfalls (see PITFALLS.md — 16 total)
1. **Vercel Hobby blocks bot-authored commits** (repo must be under a personal account, not an org) → owner noreply identity, prove in Phase 1.
2. **Silent-zero scrapers** → semantic selectors (`a[href^="/news/"]`), never hashed CSS classes; sitemap for discovery only (lastmod ≠ publish date); sanity contracts + fixtures; staleness flag + auto GitHub issue after 24h.
3. **Cron is not a clock** → odd-minute cron, `lastRunAt` + `lastSuccessAt`, commit `meta.json` every run, optional external dispatch pinger.
4. **Commit-back races** → concurrency, `pull --rebase` with retries, idempotent merge, `contents: write`; GITHUB_TOKEN pushes don't trigger other workflows.
5. **Dates/backfill** → `publishedAt` (nullable) + `datePrecision` + `firstSeenAt`; date-only = noon UTC; first run per source = backfill (not Destaques).
6. **arXiv** → HF Daily Papers primary; arXiv `announce_type=new` only, cap 15–25/day, out of Destaques, ≥3 s between requests, 1–2×/day.
7. **Classification/score/dedupe quality** → word boundaries + co-occurrence, AI-relevance gate for mixed feeds, penalties (customer stories, jobs), coverage by distinct publisher group, never store decayed score, similarity only groups (never deletes) with version-token guards; golden set (~80–100 items) + known-pairs in CI.
8. **XSS from feeds** → plain text only, http(s)-only URLs, `rel="noopener noreferrer nofollow"`, CSP, no `dangerouslySetInnerHTML`.
Also: Hobby is non-commercial (no ads/affiliate); decode feeds from `arrayBuffer` (charset/BOM safe).

## Implications for Roadmap

Order: schema → proven delivery loop → source breadth → intelligence → site features → hardening.

- **Phase 1 — Foundation & Walking Skeleton:** scaffold (Next + TS 6 + Tailwind 4), public repo on personal account, full schema (clusterId, alsoSeenIn, scoreBreakdown, publishedAt/datePrecision/firstSeenAt, schemaVersion, Meta lastRunAt/lastSuccessAt), http layer, RSS adapter, normalize/canonical/id, merge/store/orchestrator, 3–4 RSS sources with fixtures, `collect.yml` + `ci.yml`, Vercel project (main only), minimal page with client LIVE. **Exit:** a *scheduled* bot commit produces a Vercel production deploy and the page shows the new `lastUpdated`.
- **Phase 2 — Source Breadth & Resilience:** remaining RSS with include/exclude gates, GitHub releases, HF Daily Papers, capped arXiv, Anthropic (sitemap + semantic HTML), Meta (per decision 4), Reddit (per decision 3), health error kinds, date fixtures, `docs/SOURCES.md` with robots/ToS; probe all sources from a real runner.
- **Phase 3 — Intelligence:** entity dictionary, 13-category classifier + relevance gate, 72h clustering, scoring with breakdown, highlight rule, golden set + known pairs in CI, `collect:dry --fixtures`.
- **Phase 4 — Site Core:** build-views, design system, feed + day grouping + "Carregar mais", URL filters + search, Destaques, LIVE + "N novidades", copy/share, relevance chip + score popover, `lang="en"`.
- **Phase 5 — Secondary, SEO, A11y:** Em alta, Top da semana, `/fontes`, `/historico`, `/sobre` (takedown contact), SEO baseline, hub RSS, WCAG 2.2 AA, bundle budget in CI.
- **Phase 6 — Hardening & Ops:** stale-data watchdog, auto-issues, pinger, fixture refresh, size alarms, rule tuning on a week of real data, runbook.

**Research flags:** Phase 1 (Vercel author check — empirical), Phase 2 (scraper structure, runner-IP reachability, TLDR item shape), Phase 3 (thresholds on real data). Phases 4–6 are standard patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified npm/GitHub/nodejs.org 2026-10-06; platform behavior MEDIUM |
| Features | MEDIUM | SEO/WCAG HIGH |
| Architecture | MEDIUM-HIGH | Thresholds/volumes are estimates |
| Pitfalls | MEDIUM-HIGH | Scraping checked from residential IP, not runner |

### Gaps to Address
- Vercel Hobby bot-commit behavior (Phase 1, empirical).
- Reddit and Meta AI decisions (before Phase 2).
- Re-probe all sources from GitHub runners.
- 60-day keepalive with workflow commits (unconfirmed).
- Clustering/scoring thresholds, volume, `items.json` size (~1.5–4 MB est.) — measure after a week.
- Add text search, "never auto-reorder", LIVE thresholds 90/180 to requirements.
- Keep site free of ads/affiliate (Hobby non-commercial).
- Copyright framing is not legal advice; cap excerpts ~250–280 chars, name source.

## Sources
Primary: npm registry, nodejs.org, GitHub releases API, Vercel docs, GitHub Docs, arXiv API ToU, Next.js docs (Context7), Google spam/structured-data policies, WCAG 2.2, live robots.txt checks (2026-10-06).
Secondary: Vercel community threads, GitHub community #201472, Reddit API changes, Techmeme/daily.dev docs.
Tertiary: indie aggregator write-ups, size/threshold estimates, legal framing.

---
*Research completed: 2026-10-06 · Ready for roadmap: yes (two user decisions pending: Reddit, Meta AI scraping)*
