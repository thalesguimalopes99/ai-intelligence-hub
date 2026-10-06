# Walking Skeleton — AI Intelligence Hub

**Phase:** 1
**Generated:** 2026-10-06

## Capability Proven End-to-End

Without anyone touching a computer, an hourly scheduled GitHub Actions run fetches the real OpenAI RSS, commits schema-valid `data/*.json` as the repo owner, Vercel redeploys the static site, and a visitor at https://ai-intelligence-hub-br.vercel.app sees the latest OpenAI items plus a LIVE badge computed in their browser.

This project has no database: the "real write" is the collector committing `data/items.json` + `data/meta.json` to `main`. The "real read" is the build reading `data/` (and the browser polling the derived `/data/meta.json`).

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Next.js 16.3.8 App Router, React 19.3, TypeScript ~6.0.3 (never 7.x), Tailwind 4.3 CSS-first `@theme` | Locked stack (CLAUDE.md). TS 7 lacks the JS compiler API that Next type-checking needs |
| Rendering | Default `next build`, every route static (SSG). `export const dynamic = 'error'` in the root layout + `scripts/check-static.ts` manifest guard in CI. No `output: 'export'`, ISR, server actions or request-time APIs | Zero functions on Hobby; code stays export-compatible |
| Data layer | JSON in git. Canonical `data/items.json` + `data/meta.json` (bot-written, committed). `npm run build` = `tsx scripts/build-views.ts && next build` derives a compact `public/data/meta.json` (gitignored) | No DB/KV allowed (zero cost); git is the store and the audit log |
| Shared contract | One zod 4 schema in `src/shared/schema.ts` (Item, ItemsFile, Meta, SourceHealth, PublicMeta), framework-free, imported by collector, scripts and site. `schemaVersion: 1`. Intelligence fields (categories, primaryCategory, cluster, score, scoreBreakdown, isHighlight, alsoSeenIn, isBackfill) exist now with neutral values (D-02) | Later phases fill fields without a data migration |
| Identity of items | `id = sha256(normalize-url canonical URL).slice(0,16)` | Changing canonicalization later would re-ID everything, so it is fixed now |
| Serialization | One item per line, sorted publishedAt desc (nulls last, firstSeenAt desc, id asc); validate-then-tmp+rename; items.json written only if bytes differ; meta.json every run (D-03) | Minimal git diffs; no partial/corrupt files |
| Collector | Node 24 + tsx `collector/run.ts`; ky (timeouts, capped retries), feedsmith (RSS), normalize-url, node:crypto; `config/sources.ts` registry (Phase 1: only `openai-news`, D-01) | Locked stack; one source in Phase 1, broadened in Phase 2 |
| Scheduling / concurrency | `.github/workflows/collect.yml`: cron `17 * * * *` + `workflow_dispatch`, `concurrency: {group: collect, cancel-in-progress: false}`, `actions/checkout@v7` with `ref: main`, hand-written commit step with `git pull --rebase` retry ×3 | Serialized, stale-SHA-proof writers (PIPE-04) |
| Commit identity | Author AND committer `Thales Guimarães Lopes <215318905+thalesguimalopes99@users.noreply.github.com>`; message `chore(data): update feed <ISO-UTC> [+N itens]`; only `data/**` staged | Vercel Hobby author check (D-10, D-04) |
| Auth | None (public static site, no accounts) | Out of scope for the product |
| Deployment target | Vercel Hobby, personal team `thalesguimalopes99s-projects`, project `ai-intelligence-hub-br` → https://ai-intelligence-hub-br.vercel.app; Git integration; `vercel.json` main-only + `buildCommand: npm run build`. Fallback (D-10): Deploy Hook via repo secret `VERCEL_DEPLOY_HOOK` (step pre-wired, inert until the secret exists) | Zero cost; `ai-intelligence-hub.vercel.app` is taken, so the user chose the `-br` name |
| Repo | Public, personal `thalesguimalopes99/ai-intelligence-hub`. Never any Sem Fronteiras account | PIPE-05 + user rule |
| CI | `.github/workflows/ci.yml` on push/PR with `paths-ignore: data/**`: typecheck, lint (ESLint 9 — ESLint 10 breaks eslint-config-next 16.3.8), vitest 5, validate:data, build, check:static | Code-only CI (PIPE-06) |
| Freshness UI | Client island `src/components/LiveStatus.tsx`: `useSyncExternalStore` clock (server snapshot null → "verificando"), polls same-origin `/data/meta.json` every 60 s (no-store, paused when hidden); LIVE <90 min, atrasado 90–180, parado >180 or null | Static HTML is frozen; lint-safe hydration pattern (react-hooks v7) |
| Directory layout | `src/app` (routes), `src/components`, `src/lib` (build-time loaders, pure formatters), `src/shared` (schema/constants/serialize), `collector/` (run, http, adapters, pipeline, store, meta), `config/sources.ts`, `scripts/` (build-views, validate-data, check-static), `data/` (bot-only), `tests/` + `tests/fixtures/` | Collector never imports Next/React; shared contract is framework-free |
| Local runs | `DATA_DIR=<scratch> npm run collect` / `npm run build` | Local machines never write the bot-owned `data/` |
| Time | All stored timestamps UTC ISO `Z`; display in America/Sao_Paulo via `@date-fns/tz` | D-07 |
| Agent rules | `git push` only via @devops; conventional commits; `AGENTS.md` committed so `next dev` never edits CLAUDE.md | Project rules |

## Stack Touched in Phase 1

- [ ] Project scaffold (framework, build, lint, test runner) — plan 01-01
- [ ] Routing — `/` static route — plans 01-01/01-02
- [ ] Data store — real write (collector commits `data/*.json`, plans 01-04/01-07) AND real read (build reads `data/`, browser polls `/data/meta.json`, plans 01-02/01-05)
- [ ] UI — interactive element wired to data: LIVE badge island polling meta.json — plan 01-05
- [ ] Deployment — Vercel production on the personal account, triggered by scheduled data commits — plans 01-06..01-08

## Out of Scope (Deferred to Later Slices)

- More sources, per-source failure isolation across many sources, conditional GET, HTML stripping, date clamping, dedupe across URL variants, monthly archive (Phase 2)
- Gated feeds, releases, HF Papers, arXiv, Anthropic, Meta RSS, Reddit, `/fontes` (Phase 3)
- Final design, day grouping, "Carregar mais", "N novidades" pill, share, "Copiar pauta", last-visit markers (Phase 4; Phase 1 list is capped at 50, no pagination)
- Categories/companies/filters/search (Phase 5), clustering/"Em alta" (Phase 6), scoring/Destaques/"Por que 82?" (Phase 7)
- History and landing pages (Phase 8), SEO/OG/sitemap/RSS/a11y audit/payload budget (Phase 9)
- Stale-data watchdog, auto-issues, fixture refresh, runbook (Phase 10). Phase 1 only adds a README note on `gh workflow enable collect.yml`

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- Phase 2: Trustworthy official-source feed — all verified RSS sources, failure isolation, safe dates, dedupe, archive, day-grouped list
- Phase 3: Full source coverage and `/fontes` transparency page
- Phase 4: Design system and reading experience (PT-BR, share, novidades pill, last visit)
- Phase 5: Categories, companies and URL-synced filters/search
- Phase 6: Story clustering and "Em alta"
- Phase 7: Scoring, Destaques, Top da semana and score explainability
- Phase 8: History and landing pages
- Phase 9: SEO, accessibility and payload budget
- Phase 10: Operational hardening
