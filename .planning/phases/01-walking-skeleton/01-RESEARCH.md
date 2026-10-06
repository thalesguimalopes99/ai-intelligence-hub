# Phase 1: Walking Skeleton - Research

**Researched:** 2026-10-06
**Domain:** GitHub Actions scheduled collector → JSON in git → Vercel Hobby static Next.js 16 deploy loop, shared zod schema, client-side LIVE badge
**Confidence:** HIGH for the code and tooling, which was verified empirically in a scratch probe. MEDIUM for platform behaviour (the Vercel Hobby author check and the 60-day keepalive), which can only be proven by live scheduled runs.

## Summary

This phase is mostly plumbing, and most of the code-level risk has already been checked. I scaffolded a probe project with `create-next-app@16.3.8`, pinned TS 6.0.3, React 19.3.0 and Node 24, and built, linted and type-checked it locally. The checks below came from that probe:
- A Server Component that reads `data/meta.json` with `node:fs` prerenders as static `○`.
- A client island that renders the "verificando" state in server HTML compiles without hydration errors.
- `export const dynamic = 'error'` in the root layout fails the build when a request-time API is used.
- A small script can list every dynamic route from `.next/prerender-manifest.json` + `.next/app-path-routes-manifest.json`.
- feedsmith 3 parses the real OpenAI feed.

The probe also found three problems that CLAUDE.md / STACK.md did not anticipate:
1. **ESLint 10 breaks `eslint-config-next@16.3.8`** (`TypeError ... contextOrFilename.getFilename is not a function` in `eslint-plugin-react`). Pin `eslint@^9` (9.39.5).
2. **`eslint-plugin-react-hooks` v7 (shipped in `eslint-config-next`) errors on `setState` called synchronously in `useEffect`** (`react-hooks/set-state-in-effect`). The obvious "compute `now` in useEffect" LIVE badge fails `npm run lint`. Use a `useSyncExternalStore` clock (server snapshot `null`). That pattern is verified to pass lint and build.
3. **Vitest 5 does not resolve `@/*` tsconfig paths unless `resolve.tsconfigPaths: true` is set.** It is native in Vite 8 and verified.

There are also two environment facts the plan has to absorb:
- **`ai-intelligence-hub.vercel.app` is already taken** by an unrelated Chinese "AI Intelligence Hub" site that returns HTTP 200, so D-08's "if it is free" condition fails.
- **The OpenAI feed returns all 1,247 posts back to 2015** (760 KB). Only 70 of them are inside 30 days. Phase 1 must window the items.

On the platform side, official Vercel docs (updated 2026-09) say Hobby commit-author enforcement applies to *private* repos and org repos, and that "Collaboration is free for public repositories". Community threads from 2026 nonetheless show bot-authored commits being blocked ("GitHub could not associate the committer with a GitHub user"). Authoring **and committing** as `Thales Guimarães Lopes <215318905+thalesguimalopes99@users.noreply.github.com>` satisfies both readings. I verified that ID 215318905 matches the GitHub account through `gh api user`. Two scheduled runs remain the only real proof (D-11).

The single most important workflow detail for success criterion 3 is this: **a queued run checks out the stale trigger-time `GITHUB_SHA` unless `actions/checkout` is given `ref: main`.** Without that setting, a manual run queued behind a scheduled run merges onto pre-commit data and its push is rejected.

**Primary recommendation:** Hand-write a `collect.yml` with these properties:
- `checkout@v7` with `ref: main`.
- `concurrency: {group: collect, cancel-in-progress: false}`.
- A shell commit step that sets owner author and committer env vars, `git add data/`, and runs a push → `pull --rebase` → retry loop. Use this instead of `git-auto-commit-action`, which explicitly does not pull or rebase.

Alongside it:
- Ship one zod schema in `src/shared/schema.ts` that is complete for all later phases.
- Use `export const dynamic = 'error'` plus a manifest-based `check-static` script in `ci.yml`.
- Pin ESLint 9.

## Project Constraints (from CLAUDE.md)

- Zero cost: no paid APIs and no paid servers. GitHub (public repo) + Actions + Vercel Hobby only.
- Stack: Next.js 16.3.x App Router, React 19.3, **TypeScript ~6.0.3 (never 7.x)**, Tailwind 4.3 via `@tailwindcss/postcss` (CSS-first `@theme`, no `tailwind.config.js`), zod 4, Node **24.x** everywhere (`engines`, `.nvmrc`, Actions).
- Collector: `tsx` runner, `ky`, `feedsmith`, `normalize-url`, `node:crypto` sha256 ids. Do **not** use rss-parser, axios, node-fetch, moment, string-similarity, or Playwright.
- Rendering: default `next build` with every route static. **No `output: 'export'`**, no ISR/`revalidate`, no server actions, no request-time APIs. Code must stay export-compatible.
- Storage: JSON files in git, no DB/KV. Do not import the full dataset into client components.
- CI: `actions/checkout@v7`, `actions/setup-node@v7` (npm cache), cron at an off-minute (`17 * * * *`) + `workflow_dispatch`, `concurrency` with `cancel-in-progress: false`, `timeout-minutes: 10`, a separate `ci.yml` with `paths-ignore` for data.
- Deploy: Vercel Git integration on `main` only. Data commits are authored and committed under the owner's GitHub identity.
- Source integrity: never invent feed URLs. Verify every source with a real request (OpenAI RSS verified again in this session, see below).
- Content: metadata + short excerpt + link only. No AI-generated images.
- Resilience: one failing source must not crash the process.
- Project rules (.claude/rules): `git push` and `gh pr create` are @devops-exclusive. Use conventional commits. Lint and typecheck must pass before marking work complete (`npm run lint`, `npm run typecheck`).
- User memory: only the personal GitHub account `thalesguimalopes99` and its personal Vercel account. Never use Sem Fronteiras accounts, emails or teams. The git identity is the noreply address.

**Conflict with CLAUDE.md (evidence-based override):** CLAUDE.md lists `ESLint 10.12.0` (flagged MEDIUM there). That combination was **verified broken** in this session. Use `eslint@^9.39.5` until `eslint-config-next` ships ESLint 10-compatible plugins. The scaffold itself pins `"eslint": "^9"`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Collector content
- **D-01:** The Phase 1 collector fetches **one real source: OpenAI RSS** (`https://openai.com/news/rss.xml`, verified 200). It parses and normalizes the feed into the full schema so `items.json` holds real, schema-valid data from day one. Phase 2 broadens to all sources with failure isolation.
- **D-02:** Intelligence fields exist in the schema but are filled with **neutral values**: `categories: []`, no primary category, cluster as a self/singleton (or null), `score: 0`, and a zeroed `scoreBreakdown`. They are not optional and not omitted, and Phases 5–7 fill them in.

#### Commit cadence
- **D-03:** **Every successful run commits `meta.json`** (`lastRunAt`/`lastSuccessAt`/per-source health), even when no items changed, so the LIVE badge stays truthful. That is about 24 deploys/day, within Hobby's 100/day, and it doubles as the 60-day scheduled-workflow keepalive. `items.json` is written only if its stable serialization changed. Note: this deliberately interprets PIPE-02's "only when data changed" as covering meta.json too, because meta.json changes every run.
- **D-04:** Bot commit message format: `chore(data): update feed <ISO-UTC-timestamp> [+N itens]`, conventional-commit style. The workflow commits only `data/**`. `ci.yml` ignores data-only commits through `paths-ignore: data/**`.

#### Live page (Phase 1)
- **D-05:** The page is a **status header plus a raw item list**: the hub name, the LIVE/atrasado/parado badge, "última atualização", and a plain list of OpenAI items (title, date, link opening the original). It uses a dark background and PT-BR UI text, with no final design (Phase 4).
- **D-06:** The badge polls **same-origin `/data/meta.json`** about every 60 s (`cache: 'no-store'`, pausing on `visibilitychange`). It does not poll raw.githubusercontent.com. The badge is computed client-side from `lastSuccessAt`: LIVE <90 min, "atrasado" 90–180 min, "parado" >180 min.
- **D-07:** Time display is **relative plus absolute in America/Sao_Paulo**, e.g. "há 12 min · 06/10 14:17 (Brasília)". All stored timestamps are UTC ISO strings.

#### Repo, Vercel & deploy fallback
- **D-08:** Repo name **`ai-intelligence-hub`**, public, under the personal account **`thalesguimalopes99`**. The Vercel project has the same name, giving the target URL `ai-intelligence-hub.vercel.app` if it is free. **Never use the Sem Fronteiras account, email or team.** Vercel scope must be the personal account.
- **D-09:** Claude creates the repo and the Vercel project via **`gh` + `vercel` CLI**. The user only approves and logs in if needed. `git push` stays an @devops responsibility, per project rules.
- **D-10:** Data commits are authored and committed as `Thales Guimarães Lopes <215318905+thalesguimalopes99@users.noreply.github.com>`. **Fallback if Hobby refuses those deploys: a Vercel Deploy Hook** (`curl -fsS -X POST "$VERCEL_DEPLOY_HOOK"`, stored as a repo secret) called after the commit. Vercel CLI is not the fallback.
- **D-11:** **"Proven" = 2 consecutive scheduled (not manual) runs** that each produce a commit and a production deploy with the badge/time advancing on the live site. The manual-during-scheduled concurrency test (success criterion 3) must also pass. Only then does Phase 2 start.

### Claude's Discretion
- Exact cron minute (off-minute, e.g. `17 * * * *`), file layout, schema field naming details, and how the "route became dynamic" CI check works.
- The visual details of the skeleton page beyond "dark, PT-BR, plain".

### Deferred Ideas (OUT OF SCOPE)
None. The discussion stayed within phase scope.

### Additional user decision (this session, via orchestrator)
- The feed list in Phase 1 shows at most the **50 most recent items**, with no pagination (matches UI-SPEC).
- The UI-SPEC (`01-UI-SPEC.md`, approved) is the binding visual and interaction contract: tokens, copy, badge states including "verificando", and date formats.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PIPE-01 | Hourly off-minute cron + manual trigger on Actions | `collect.yml` pattern (cron `17 * * * *` + `workflow_dispatch`). Schedule runs only from the default branch, and the workflow file must be on `main` [CITED: docs.github.com events-that-trigger-workflows] |
| PIPE-02 | Commit only when data changed (+meta.json), Hobby-acceptable author | `git add data/` + `git diff --cached --quiet` guard. items.json is rewritten only when the stable serialization differs. Owner author **and** committer env vars (Commit identity section) |
| PIPE-03 | Every data commit → Vercel production deploy (proven with a scheduled run) | Vercel Git integration, `main` = production. Verification commands in the Validation Architecture section. Deploy Hook fallback (D-10) |
| PIPE-04 | Concurrent runs never corrupt data | `concurrency` without cancel + **`checkout ref: main`** (stale-SHA pitfall) + idempotent merge by id + push/rebase/retry loop |
| PIPE-05 | Public repo under personal account; only `main` deploys | `gh repo create thalesguimalopes99/ai-intelligence-hub --public`. `vercel.json` `git.deploymentEnabled` with `"**": false, "main": true` |
| PIPE-06 | CI typecheck/lint/tests on code changes, not data-only; fail on dynamic route | `ci.yml` with `paths-ignore: ['data/**']`, `export const dynamic = 'error'` in the root layout + `scripts/check-static.ts`. Both verified empirically |
| DATA-01 | One zod schema with all fields | Full schema in the Code Examples section (Item, ItemsFile, Meta, SourceHealth). zod 4 behaviours verified |
| DATA-07 | meta.json: lastRunAt, lastSuccessAt, per-source health | `Meta` + `SourceHealth` schema, including `consecutiveFailures` and `errorKind` |
| DATA-08 | Atomic writes, stable serialization, prebuild derives gitignored `public/data/` | tmp+rename write after zod validation, one-item-per-line serializer (zod output key order = schema order, verified), and `build` script chaining `build-views` before `next build` |
| FEED-06 | Client LIVE badge from lastSuccessAt, polling meta.json without reload | `useSyncExternalStore` clock island + `fetch('/data/meta.json',{cache:'no-store'})` every 60 s. Pure `liveStatus()`/`formatRelative()` functions unit-tested |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Scheduling, concurrency, commit/push | CI (GitHub Actions) | — | No server exists. Actions is the only compute that runs unattended |
| Fetch + normalize + merge + validate + write JSON | Collector (Node/tsx in Actions) | — | Must run without the owner's machine. Never imports Next/React |
| Shared data contract | Shared module (`src/shared/schema.ts`, framework-free) | — | One zod schema serves as the collector's output gate and the site's input contract |
| Canonical store (`data/*.json`) | Git repo (Storage) | — | JSON in git is the DB and the audit log. Only the bot writes it |
| Client views (`public/data/meta.json`) | Build step (Vercel `build` script) | — | Derived and gitignored, so no double git growth |
| HTML for header + item list | Frontend build (SSG Server Components) | CDN | Prerendered from `data/` at build time. Zero functions |
| LIVE badge state + relative time | Browser (client island) | CDN (serves `/data/meta.json`) | Static HTML is frozen. Freshness must be computed in the browser |
| Deploy trigger + author check | Vercel Git integration | Deploy Hook (fallback) | Webhook on push to `main` |
| Dynamic-route guard | CI (`ci.yml`) | Build (`dynamic='error'`) | Keeps Hobby at zero functions and keeps the code export-compatible |

## Standard Stack

### Core (versions verified with `npm view`, 2026-10-06)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.3.8 | App Router site, static prerender | Locked stack. Probe build OK [VERIFIED: npm registry + local build] |
| react / react-dom | 19.3.0 | UI | The scaffold pins 19.2.8. Bump to 19.3.0 (peer `^19`, verified builds) [VERIFIED: npm registry] |
| typescript | ~6.0.3 | Types | `latest` is 7.0.2, so pin ~6.0.3. `typescript-eslint@8.71.1` peer is `>=4.8.4 <6.1.0`, which confirms 7.x would break lint as well [VERIFIED: npm registry] |
| tailwindcss + @tailwindcss/postcss | 4.3.3 (both) | Styling, CSS-first `@theme` | Scaffold default [VERIFIED: npm registry] |
| zod | 4.6.5 | Shared schema | `z.iso.datetime()` (requires `Z`, rejects offsets), `z.httpUrl()` (rejects `javascript:`), `z.int()`, `z.strictObject()` all verified [VERIFIED: local tsx run] |
| eslint | **^9.39.5** (not 10) | Lint | ESLint 10 crashes `eslint-plugin-react` inside `eslint-config-next@16.3.8` [VERIFIED: local run] |
| eslint-config-next | 16.3.8 | Next lint rules (flat config) | Scaffold `eslint.config.mjs` uses `core-web-vitals` + `typescript`. The `lint` script is just `eslint` [VERIFIED: scaffold] |

### Collector (Phase 1 subset)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| feedsmith | 3.0.1 | Parse RSS | `parseFeed(xml)` → `{format:'rss', feed:{items:[{title, link, description, categories:[{name}], guid:{value,isPermaLink}, pubDate}]}}`. Shape verified on the live OpenAI feed [VERIFIED: local run] |
| ky | 2.1.0 | Fetch with timeout/retry | `timeout`, `totalTimeout`, `retry.limit`, `retry.maxRetryAfter` (default `Infinity`, so set it), `retry.jitter`, `retry.retryOnTimeout` [VERIFIED: node_modules/ky/readme.md] |
| normalize-url | 9.0.1 | Canonical URL → id | **Include in Phase 1**: the id is `sha256(canonicalUrl)`, so changing canonicalization in Phase 2 would re-ID every item (a migration). Options verified on OpenAI URLs [VERIFIED: local run] |
| tsx | 4.23.15 | Run TS scripts, honours `@/*` paths | Verified `@/shared/x` import via tsx [VERIFIED: local run] |
| node:crypto | built-in | `createHash('sha256')…slice(0,16)` | id |

### Site / test
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns + @date-fns/tz | 4.4.0 + 1.5.0 | PT-BR formatting in `America/Sao_Paulo` | `format(d, 'dd/MM HH:mm', { in: tz('America/Sao_Paulo') })` and `new TZDate(iso,'America/Sao_Paulo')` both verified. `ptBR` locale needed only for month/day names (not used in the Phase 1 formats) |
| lucide-react | 1.52.0 | `ExternalLink`, `AlertTriangle` | UI-SPEC |
| vitest | 5.0.3 | Unit tests | **Needs `resolve: { tsconfigPaths: true }`** in `vitest.config.ts` [VERIFIED: fails without it, passes with it] |
| @types/node | ^24 | Node types | Scaffold puts `^20`. Change it to match the runtime |

**Not needed in Phase 1** (Phase 2+): cheerio, fast-xml-parser, p-limit, clsx.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-written commit/push step | `stefanzweifel/git-auto-commit-action@v7` | Its README says it "won't handle complex scenarios like rebasing or pulling before pushing". PIPE-04 requires rebase-and-retry, so a 15-line shell step is simpler and auditable |
| `useSyncExternalStore` clock | `useEffect` + `setState` | Fails `react-hooks/set-state-in-effect` (lint error, verified) |
| Manifest-based `check-static` | Grep `next build` stdout for `ƒ` | Stdout format is cosmetic and could change. The manifests are machine-readable. Doing both is cheap |

**Installation (after copying the scaffold files in, see Pitfall 7):**
```bash
npm i next@16.3.8 react@19.3.0 react-dom@19.3.0 zod@4.6.5 date-fns@4.4.0 @date-fns/tz@1.5.0 lucide-react@1.52.0
npm i -D typescript@~6.0.3 @types/node@^24 @types/react@^19 @types/react-dom@^19 \
  tailwindcss@4.3.3 @tailwindcss/postcss@4.3.3 eslint@^9.39.5 eslint-config-next@16.3.8 \
  tsx@4.23.15 vitest@5.0.3 feedsmith@3.0.1 ky@2.1.0 normalize-url@9.0.1
```
Keep collector-only packages in devDependencies (Vercel installs devDeps for the build).

## Package Legitimacy Audit

slopcheck **could not run**: Python/pip are not installed on this machine. Per protocol, every package below is formally `[ASSUMED]` for slopcheck purposes. All of them were found through CLAUDE.md/STACK.md (official docs and READMEs), confirmed on the npm registry, and **installed and exercised in a local probe this session**. None of them has a `postinstall` script (`npm view <pkg> scripts.postinstall` was empty for all).

| Package | Registry | Age | Downloads/wk | Source Repo | slopcheck | Disposition |
|---------|----------|-----|--------------|-------------|-----------|-------------|
| next | npm | 15 yrs | 76.9M | github.com/vercel/next.js | n/a | Approved (official) |
| react / react-dom | npm | 15 / 12 yrs | 224M / 211M | github.com/react/react | n/a | Approved |
| typescript | npm | 14 yrs | 365M | github.com/microsoft/TypeScript | n/a | Approved (pin ~6.0.3) |
| tailwindcss / @tailwindcss/postcss | npm | 9 / 2.7 yrs | 163M / 49.6M | github.com/tailwindlabs/tailwindcss | n/a | Approved |
| zod | npm | 6.5 yrs | 387M | github.com/colinhacks/zod | n/a | Approved |
| eslint / eslint-config-next | npm | 13 / 11 yrs | 198M / 42M | eslint/eslint, vercel/next.js | n/a | Approved (eslint ^9) |
| tsx | npm | 11 yrs | 114M | github.com/privatenumber/tsx | n/a | Approved |
| vitest | npm | 4.8 yrs | 142M | github.com/vitest-dev/vitest | n/a | Approved |
| date-fns / @date-fns/tz | npm | 12 / 2 yrs | 122M / 45.8M | github.com/date-fns/date-fns | n/a | Approved |
| lucide-react | npm | 6 yrs | 134M | github.com/lucide-icons/lucide | n/a | Approved |
| ky | npm | 10.5 yrs | 8.6M | github.com/sindresorhus/ky | n/a | Approved |
| normalize-url | npm | ~10 yrs | (high) | github.com/sindresorhus/normalize-url | n/a | Approved |
| feedsmith | npm | 1.5 yrs | 66k | github.com/macieklamberski/feedsmith | n/a | Approved. Lowest-adoption package, but its README is authoritative and parsing was verified. The planner may gate it with checkpoint:human-verify |
| @types/node | npm | 10 yrs | 548M | DefinitelyTyped | n/a | Approved |

**Packages removed due to [SLOP]:** none. **Flagged [SUS]:** none.
*slopcheck was unavailable, so the planner should treat the list as `[ASSUMED]`. A single `checkpoint:human-verify` before the first `npm i` (reviewing this table) is sufficient.*

Note: npm 11.16 prints `allow-scripts` warnings for `esbuild` and `unrs-resolver` install scripts. In the probe, tsx, eslint and `next build` all worked **without** approving them. Do not run `npm approve-scripts --all`.

## Architecture Patterns

### System Architecture Diagram

```
 GitHub scheduler (cron 17 * * * *) ──┐        owner: gh workflow run collect.yml
                                      ▼                      │
                      ┌─ concurrency group "collect" (queue, never cancel) ◄─┘
                      ▼
  checkout ref: main (LIVE tip, not trigger SHA) → setup-node 24 + npm ci
                      ▼
  tsx scripts/collect.ts
     read data/items.json + data/meta.json (missing → empty)
     ky GET openai.com/news/rss.xml ──fail──► health=error, keep previous items
            │ ok
     feedsmith parseFeed → normalize (canonical URL, sha256 id, dates, neutral intel fields)
     merge(prev, fresh) by id (keep firstSeenAt) → window 30d → sort
     zod validate ALL ──invalid──► exit 1, write NOTHING
            │ valid
     stable-serialize → write items.json only if bytes differ; ALWAYS write meta.json (tmp+rename)
     emit GITHUB_OUTPUT: items_new, run_status
                      ▼
  commit step: git add data/ → diff --cached --quiet? → commit as OWNER (author+committer)
     → push origin HEAD:main ──rejected──► pull --rebase → retry (×3) ──conflict──► fail job
     → if run_status=failed: fail job AFTER push (owner gets email; LIVE degrades honestly)
                      ▼
  GitHub push webhook → Vercel Git integration (main = production; author check vs owner)
     ──blocked──► [fallback D-10] curl -X POST $VERCEL_DEPLOY_HOOK
                      ▼
  Vercel build: npm run build = tsx scripts/build-views.ts (data/ → zod → public/data/meta.json)
                                && next build (page reads data/ via fs; dynamic='error')
                      ▼
  CDN static HTML: header + badge "verificando" + absolute time + ≤50 items
                      ▼
  Browser island: useSyncExternalStore clock (30 s tick) + poll /data/meta.json (60 s, no-store,
                  pause when hidden) → liveStatus(lastSuccessAt, now) → LIVE/atrasado/parado
```

### Recommended Project Structure
```
/
├── .github/workflows/
│   ├── collect.yml            # hourly data job (commits data/** only)
│   └── ci.yml                 # code CI: typecheck, lint, test, build, check-static (paths-ignore data/**)
├── .nvmrc                     # 24
├── .gitattributes             # * text=auto eol=lf  (Windows dev box, Linux bot)
├── AGENTS.md                  # Next's managed agent-rules block (see Pitfall 8), so `next dev` leaves CLAUDE.md alone
├── vercel.json                # git.deploymentEnabled: main only
├── config/sources.ts          # one entry: openai-news (url verified)
├── collector/
│   ├── run.ts                 # orchestrator (entry for `npm run collect`)
│   ├── http.ts                # ky instance: UA, timeout, retry caps
│   ├── adapters/rss.ts        # feedsmith → RawEntry[]
│   ├── pipeline/normalize.ts  # RawEntry → Item (canonical url, id, dates, neutral intel)
│   ├── pipeline/canonical-url.ts
│   ├── pipeline/merge.ts      # idempotent union by id, keep firstSeenAt; window + sort
│   └── store.ts               # read/validate/serialize/atomic write
├── src/
│   ├── shared/schema.ts       # zod: Item, ItemsFile, Meta, SourceHealth (framework-free)
│   ├── shared/constants.ts    # SCHEMA_VERSION, CATEGORIES, LIVE thresholds, WINDOW_DAYS, FEED_LIMIT=50
│   ├── shared/serialize.ts    # stable one-item-per-line JSON (used by collector + tests)
│   ├── lib/data.ts            # build-time loaders (server only): tolerate missing files → empty state
│   ├── lib/live-status.ts     # pure: liveStatus(), formatRelative(), formatAbsolute()
│   ├── app/layout.tsx         # export const dynamic = 'error'; lang="pt-BR"; Geist
│   ├── app/page.tsx           # Server Component: header + status panel + list
│   ├── app/globals.css        # UI-SPEC @theme tokens verbatim
│   └── components/LiveStatus.tsx  # "use client" island
├── scripts/
│   ├── collect.ts?            # (optional thin alias to collector/run.ts)
│   ├── build-views.ts         # data/ → public/data/meta.json (validated)
│   ├── check-static.ts        # post-build: fail if any app route is not prerendered
│   └── validate-data.ts       # zod-validate committed data/ (CI + manual)
├── data/                      # CANONICAL, bot-only: items.json, meta.json
├── public/data/               # GENERATED, .gitignored
└── tests/
    ├── fixtures/feeds/openai.xml   # trimmed real snapshot (~15 items) + edge cases
    └── *.test.ts
```

### Pattern 1: Stale-SHA-proof serialized collector
**What:** One concurrency group with no cancel, checkout of the branch tip, idempotent merge, and push with rebase retry.
**When:** Always, for every data-writing workflow.
**Why:** For `schedule` and `workflow_dispatch`, `GITHUB_SHA` = "last commit on default branch" **at trigger time** [CITED: docs.github.com events-that-trigger-workflows]. A run that waited in the concurrency queue would otherwise check out the commit from *before* the previous run's data commit [CITED: community reports, e.g. hivecommons/docs#235, F1Lllewellyn/f1-data-publisher#117]. Setting `ref: main` makes checkout fetch the branch tip when the step executes.

### Pattern 2: Validate-then-write, write-only-if-changed
- Build the full `ItemsFile` and `Meta` in memory, then `ItemsFile.parse()` / `Meta.parse()` (zod output key order = schema order, verified, so key order is stable for free).
- Serialize items with one item per line. Compare with the existing file bytes. Write `items.json` only if different. Always write `meta.json`.
- Write to `file.tmp` in the same dir, re-read and parse, then `fs.rename` over the target.
- **Do not put per-run volatile fields in items** (no `lastSeenAt`, no `generatedAt` in the items envelope). Otherwise items.json changes every hour and the diffs explode. Per-run timestamps live only in `meta.json`.

### Pattern 3: Hydration-safe LIVE island
- The server (build) renders the badge in the **"verificando"** state + absolute "dd/MM HH:mm (Brasília)". That output is deterministic, so there is no mismatch.
- The client uses `useSyncExternalStore(subscribeClock, getClock, () => null)`. During hydration React uses the server snapshot (`null`) and then re-renders with the client clock. Verified: server HTML contains `<span>verificando</span>`, and lint and build pass.
- Polling lives in `useEffect` but calls `setState` only inside async callbacks, which is allowed by `react-hooks/set-state-in-effect`.
- The `aria-live` region should announce only state changes and skip the first evaluation (UI-SPEC).

### Pattern 4: Two-layer static guard (PIPE-06)
1. `export const dynamic = 'error'` in `src/app/layout.tsx`. Verified: using `headers()` anywhere fails `next build` with "couldn't be rendered statically because it used `headers()`". This is valid because `cacheComponents` is **off** by default. If anyone ever enables `cacheComponents`, `dynamic` is removed [CITED: nextjs.org route-segment-config, v16.3.8], and layer 2 still guards.
2. `scripts/check-static.ts` after `next build`: every value in `.next/app-path-routes-manifest.json` must be a key of `.next/prerender-manifest.json` `.routes`. Verified: it reported `['/dyn']` for a `headers()` page and `[]` for the clean app. The routes `/_global-error`, `/_not-found` and `/favicon.ico` are all prerendered.

### Anti-Patterns to Avoid
- **Computing LIVE or "há N min" at build time:** the HTML is frozen and would say LIVE forever.
- **`git-auto-commit-action` without a pull/rebase:** a human push during the run leads to a non-fast-forward rejection.
- **Committing as `github-actions[bot]`, or setting only the author:** Vercel's error text names the *committer* ("could not associate the committer with a GitHub user"). Set `GIT_AUTHOR_*` **and** `GIT_COMMITTER_*`.
- **Interpolating feed text into `run:` shell or commit messages:** script injection. The commit message uses only the ISO timestamp + an integer from `GITHUB_OUTPUT`.
- **Storing the whole OpenAI feed** (1,247 items since 2015): window to 30 days by `publishedAt` (70 items today). The page shows the 50 newest.
- **Relying on npm `prebuild` hooks implicitly:** make `"build": "tsx scripts/build-views.ts && next build"` explicit, so any Vercel build command path generates `public/data`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| RSS parsing | regex/XML walker | feedsmith `parseFeed` | CDATA, namespaces, malformed feeds |
| HTTP timeout/retry/Retry-After | custom loop | ky (`timeout`, `retry.{limit,maxRetryAfter,jitter,retryOnTimeout}`) | Edge cases in backoff and header parsing |
| URL canonicalization | string replace | normalize-url (`stripWWW`, `removeTrailingSlash`, `stripHash`, `forceHttps`, `removeQueryParameters:[/^utm_\w+/i,'ref','fbclid','gclid']`, `sortQueryParameters`) | Locks ids now. Phase 2 must not change them |
| Schema / runtime validation | manual checks | zod 4 (`z.httpUrl`, `z.iso.datetime`, `z.int`) | Same contract for collector and site |
| Time zones | manual UTC-3 offsets | `@date-fns/tz` (`tz('America/Sao_Paulo')`) | Brazil has no DST today, but never hard-code offsets |
| Dynamic-route detection | parsing build stdout only | Next manifests + `dynamic='error'` | Machine-readable, verified |

**Key insight:** The only bespoke logic in this phase should be merge (about 20 lines), stable serialization (about 15 lines), `liveStatus`/`formatRelative` (about 30 lines) and the commit shell step. Everything else is configuration of verified tools.

## Common Pitfalls

### Pitfall 1: Queued run checks out a stale SHA (breaks success criterion 3)
**What goes wrong:** A manual run waits behind a scheduled run, starts, checks out the pre-commit SHA, merges onto old data, and its push is rejected. Or a rebase conflicts on `items.json`/`meta.json`.
**How to avoid:** Use `actions/checkout@v7` with `ref: main`. Add a defensive `git pull --ff-only origin main` before the collector if desired.
**Warning signs:** `! [rejected] main -> main (fetch first)` in a queued run's log.

### Pitfall 2: Vercel Hobby blocks the data commit
**What goes wrong:** The deployment shows "Blocked" or does not exist. The site never updates while Actions is green.
**How to avoid:**
- Author and committer = `215318905+thalesguimalopes99@users.noreply.github.com` (ID verified via `gh api user`).
- Confirm the Vercel account's **Login Connections** includes GitHub `thalesguimalopes99`. The CLI is logged in as `thalesguimalopes99`, team `thalesguimalopes99s-projects` (hobby), which was verified, but the login *connection* must be checked by the user in the dashboard.
- The repo must be public and personal.
Official docs say author enforcement targets private/org repos [CITED: vercel.com/docs/git "Deploying private Git repositories"; vercel.com/docs/deployments/troubleshoot-project-collaboration "Collaboration is free for public repositories"]. Community threads from 2026 still report blocks, so owner identity covers both.
**Fallback (D-10):** Create a Deploy Hook (`vercel deploy-hooks create collect --ref main`, which is a documented CLI command) and store it as secret `VERCEL_DEPLOY_HOOK`. Call it after the push only if blocking is observed. Caveat: the Deploy Hooks doc says "If your deploy hook fails to create a deployment, check the status check on the commit ... see Troubleshooting project collaboration". It therefore **may be subject to the same author check** on the branch head [CITED: vercel.com/docs/deploy-hooks]. If the owner identity fails, the hook probably fails too. Escalate to the user rather than assume.
**Warning signs:** No Vercel status/check on the bot commit (`gh api repos/{o}/{r}/commits/{sha}/status`), or a Vercel bot comment saying blocked.

### Pitfall 3: ESLint 10 / react-hooks v7 surprises
**What goes wrong:** With `eslint@10`, `npm run lint` crashes. The "obvious" `useEffect(() => setNow(Date.now()), [])` fails lint with `react-hooks/set-state-in-effect`.
**How to avoid:** Pin `eslint@^9.39.5` (it prints an npm "no longer supported" deprecation warning, which is expected and harmless). Use the `useSyncExternalStore` clock (Code Examples).

### Pitfall 4: OpenAI RSS blocked from the runner's datacenter IP
**What goes wrong:** openai.com is behind Cloudflare (`server: cloudflare`, `cf-cache-status: DYNAMIC`). It returned 200 from a residential IP with an honest UA this session, but GitHub runner IPs were **not** tested.
**How to avoid:** Make the **first manual `workflow_dispatch` run a probe**: the collector logs the HTTP status and the first 200 bytes on failure. If it is 403 or a challenge page, D-01 cannot be satisfied as written, so stop and ask the user (do not silently swap the source).
**Warning signs:** HTTP 403/503, an HTML body containing `Just a moment` or `cf-chl`.

### Pitfall 5: items.json churn defeats "write only if changed"
**What goes wrong:** Per-run fields (`lastSeenAt`, `generatedAt`, a recomputed decay) change every item every hour, which bloats git and makes every diff noisy.
**How to avoid:** Keep items free of per-run fields in Phase 1. Note for Phase 7: score decay recomputed hourly will reintroduce churn, so decide there whether to store decayed scores or compute decay at build/view time.

### Pitfall 6: Commit identity and push credentials
**What goes wrong:** Setting only `user.name`/`user.email` via `git config` works. Using `git-auto-commit-action` defaults (`github-actions[bot]`) does not. A default-read `GITHUB_TOKEN` cannot push.
**How to avoid:** Set `permissions: contents: write` at workflow level. `checkout@v7` persists credentials (in a `$RUNNER_TEMP` file since v6), so `git push` just works [CITED: github.com/actions/checkout README].

### Pitfall 7: create-next-app refuses or clobbers the existing repo root
**What goes wrong:** The repo root already holds `.planning/`, `CLAUDE.md`, `.claude/` and other files. create-next-app treats unexpected files as conflicts, and its template **also writes `CLAUDE.md` and `AGENTS.md`**, which would overwrite the GSD-managed CLAUDE.md.
**How to avoid:** Scaffold into a temp dir (`--skip-install --disable-git --yes`), then copy only `package.json` (merge scripts/deps), `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `next-env.d.ts` handling and `src/app/*`. **Never copy its CLAUDE.md.** Drop the sample SVGs in `public/`. Merge its `.gitignore` entries into the existing one.

### Pitfall 8: `next dev` rewrites CLAUDE.md
**What goes wrong:** `next dev` auto-upserts a "nextjs-agent-rules" block into `AGENTS.md` or `CLAUDE.md` when it detects an AI agent [VERIFIED: next@16.3.8 dist/server/lib/generate-agent-files.js]. If AGENTS.md is absent and CLAUDE.md exists, **it edits the project's CLAUDE.md**.
**How to avoid:** Commit an `AGENTS.md` containing the block. The code then upserts AGENTS.md and skips CLAUDE.md. The block also tells agents to read `node_modules/next/dist/docs/`, which is useful for executors.

### Pitfall 9: Domain name taken
**What goes wrong:** `ai-intelligence-hub.vercel.app` is already live (an unrelated site, HTTP 200). Vercel will auto-assign a suffixed `*.vercel.app` domain.
**How to avoid:** Ask the user for a project alias. Candidates that returned 404 (likely free): `ai-intelligence-hub-br`, `thales-ai-hub`, `ai-intel-hub-br`. Record the final URL in STATE/PROJECT, and use it in the User-Agent and future `SITE_URL`.

### Pitfall 10: Line endings and Windows dev box
**What goes wrong:** `core.autocrlf=false` on this machine. Files edited on Windows may get CRLF while the bot writes LF, which produces whole-file diffs on data and on YAML.
**How to avoid:** Add `.gitattributes` with `* text=auto eol=lf` before the first code commit. Package scripts must be cross-platform (Node scripts, no `rm -rf`).

### Pitfall 11: First deploy happens before any data exists
**What goes wrong:** The first code push to `main` builds before the collector has ever run, so `data/*.json` are missing and the build crashes.
**How to avoid:**
- `lib/data.ts` and `build-views.ts` treat missing files as an empty ItemsFile and a Meta with `lastSuccessAt: null`, which gives the UI-SPEC empty state + "parado" + "ainda nenhuma coleta concluída".
- They still **fail the build on present-but-invalid** data. The previous deployment then stays live, which is the safe behaviour.
- Alternatively, seed `data/` from the first workflow run. Do not hand-author data.

### Pitfall 12: 60-day scheduled-workflow disable (unconfirmable in this phase)
GitHub docs: "In a public repository, scheduled workflows are automatically disabled when no repository activity has occurred in 60 days" [CITED: docs.github.com]. Whether GITHUB_TOKEN-pushed commits count is **not documented**. Community sources say "commits count" without distinguishing pushers. Hourly owner-authored commits are the best available mitigation. **This cannot be proven within Phase 1** (it needs 60 days). Document `gh workflow enable collect.yml` in a runbook note, and leave the stale-data watchdog to Phase 10 (OPS-02).

## Code Examples

### collect.yml (hand-written; replaces the git-auto-commit sketch in STACK.md)
```yaml
# Source: patterns verified against docs.github.com (schedule/workflow_dispatch SHA semantics),
# actions/checkout README, Vercel collaboration docs. Commit identity = D-10.
name: collect
on:
  schedule:
    - cron: '17 * * * *'
  workflow_dispatch:
    inputs:
      hold_seconds:   # test aid for success criterion 3 (keeps a run open); default 0
        description: 'Sleep before commit (concurrency test only)'
        required: false
        default: '0'
permissions:
  contents: write
concurrency:
  group: collect
  cancel-in-progress: false
jobs:
  collect:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    env:
      GIT_AUTHOR_NAME: 'Thales Guimarães Lopes'
      GIT_AUTHOR_EMAIL: '215318905+thalesguimalopes99@users.noreply.github.com'
      GIT_COMMITTER_NAME: 'Thales Guimarães Lopes'
      GIT_COMMITTER_EMAIL: '215318905+thalesguimalopes99@users.noreply.github.com'
    steps:
      - uses: actions/checkout@v7
        with:
          ref: main            # CRITICAL: branch tip at execution time, not trigger-time GITHUB_SHA
      - uses: actions/setup-node@v7
        with:
          node-version-file: '.nvmrc'
          cache: npm
      - run: npm ci
      - id: collect
        run: npm run collect   # exits 1 (writes nothing) only on validation failure
        env:
          COLLECT_TRIGGER: ${{ github.event_name }}
      - if: ${{ github.event_name == 'workflow_dispatch' && inputs.hold_seconds != '0' }}
        run: sleep "${HOLD}"
        env:
          HOLD: ${{ inputs.hold_seconds }}
      - name: Commit and push data
        env:
          ITEMS_NEW: ${{ steps.collect.outputs.items_new }}
        run: |
          git add data/
          if git diff --cached --quiet; then echo "No data changes"; exit 0; fi
          TS="$(date -u +%Y-%m-%dT%H:%MZ)"
          git commit -m "chore(data): update feed ${TS} [+${ITEMS_NEW:-0} itens]"
          for attempt in 1 2 3; do
            if git push origin HEAD:main; then exit 0; fi
            git pull --rebase origin main || { git rebase --abort; echo "Rebase conflict"; exit 1; }
            sleep $((attempt * 5))
          done
          exit 1
      - if: ${{ steps.collect.outputs.run_status == 'failed' }}
        run: |
          echo "::error::All required sources failed (meta.json committed with error health)"
          exit 1
```
Notes: `ITEMS_NEW` must be validated as an integer by the collector before it writes `GITHUB_OUTPUT`. The input name `hold_seconds` is optional scaffolding. Drop it if the planner prefers watching for an in-progress scheduled run (see Validation).

### ci.yml
```yaml
name: ci
on:
  push:
    branches: [main]
    paths-ignore: ['data/**']
  pull_request:
    paths-ignore: ['data/**']
permissions:
  contents: read
jobs:
  ci:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version-file: '.nvmrc', cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
      - run: npm run validate:data      # committed data/ passes the shared schema (skips if absent)
      - run: npm run build              # build-views && next build (dynamic='error' guard)
      - run: npm run check:static       # manifest guard
```
Data commits pushed with `GITHUB_TOKEN` do not trigger workflows at all [CITED: GitHub docs, "events triggered by GITHUB_TOKEN... will not create a new workflow run"]. `paths-ignore` also covers owner-pushed data-only commits. Never use `pull_request_target`.

### vercel.json
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "git": { "deploymentEnabled": { "**": false, "main": true } }
}
```
Semantics: "If a branch matches multiple rules and at least one rule is `true`, a deployment will occur" (minimatch) [CITED: vercel.com/docs/project-configuration/git-configuration]. Use `**` rather than `*`, because minimatch `*` does not match `/` (for example `gsd/phase-01-...`) [ASSUMED: minimatch default semantics as applied by Vercel].

### package.json essentials
```json
{
  "type": "module",
  "engines": { "node": "24.x" },
  "scripts": {
    "dev": "next dev",
    "build": "tsx scripts/build-views.ts && next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "collect": "tsx collector/run.ts",
    "validate:data": "tsx scripts/validate-data.ts",
    "check:static": "tsx scripts/check-static.ts"
  }
}
```

### Shared schema (src/shared/schema.ts): complete for all phases
```ts
// Source: zod 4.6.5 APIs verified locally (z.iso.datetime requires 'Z'; z.httpUrl rejects javascript:)
import { z } from 'zod';

export const SCHEMA_VERSION = 1 as const;
export const CATEGORIES = ['models','agents','coding','api','automation','prompt-engineering',
  'research','image','video','audio','business','safety','hardware'] as const;   // INTL-03 (13)

const IsoUtc = z.iso.datetime();             // UTC 'Z' only — all stored timestamps
export const Category = z.enum(CATEGORIES);
export const DatePrecision = z.enum(['datetime', 'day', 'none']);  // none ⇔ publishedAt null
export const ItemKind = z.enum(['post', 'paper', 'release', 'discussion', 'newsletter']);

export const ScoreBreakdown = z.object({      // additive points; all 0 in Phase 1 (D-02)
  source: z.number(), boosts: z.number(), coverage: z.number(),
  penalties: z.number(), ageDecay: z.number(),
});
export const ClusterInfo = z.object({         // singleton in Phase 1: id = item.id
  id: z.string().min(1), isPrimary: z.boolean(),
  size: z.int().min(1), memberIds: z.array(z.string()),
});
export const Item = z.object({
  id: z.string().regex(/^[0-9a-f]{16}$/),    // sha256(canonicalUrl).slice(0,16)
  url: z.httpUrl(),                           // canonical, opened by the link
  title: z.string().min(1).max(500),
  excerpt: z.string().max(280),               // plain text; '' allowed
  lang: z.string().min(2).max(10),            // 'en' → rendered lang attr
  sourceId: z.string().min(1),
  company: z.string().min(1),                 // free string now; dictionary in Phase 5
  kind: ItemKind,
  publishedAt: IsoUtc.nullable(),             // never stamped "now" (DATA-03)
  datePrecision: DatePrecision,
  firstSeenAt: IsoUtc,                        // set once, never changes
  isBackfill: z.boolean(),                    // DATA-04 (Phase 2 semantics)
  categories: z.array(Category),              // [] in Phase 1
  primaryCategory: Category.nullable(),       // null in Phase 1
  alsoSeenIn: z.array(z.string()),            // other sourceIds, same canonical URL (INTL-01)
  cluster: ClusterInfo,                       // INTL-02
  score: z.int().min(0).max(100),             // 0 in Phase 1
  scoreBreakdown: ScoreBreakdown,             // zeroed in Phase 1
  isHighlight: z.boolean(),                   // false in Phase 1
});
export const ItemsFile = z.object({ schemaVersion: z.literal(SCHEMA_VERSION), items: z.array(Item) });

export const ErrorKind = z.enum(['timeout','network','http','blocked','parse','empty','parser_contract','invalid']);
export const SourceHealth = z.object({
  id: z.string(), name: z.string(), url: z.httpUrl(),
  status: z.enum(['ok', 'not_modified', 'error', 'disabled']),
  optional: z.boolean(),
  lastAttemptAt: IsoUtc.nullable(), lastSuccessAt: IsoUtc.nullable(),
  consecutiveFailures: z.int().min(0),
  errorKind: ErrorKind.nullable(), httpStatus: z.int().nullable(), message: z.string().max(300).nullable(),
  itemsFetched: z.int().min(0), itemsNew: z.int().min(0),
});
export const Meta = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  lastRunAt: IsoUtc,
  lastSuccessAt: IsoUtc.nullable(),           // LIVE uses this, never lastRunAt
  lastRunStatus: z.enum(['ok', 'partial', 'failed']),
  run: z.object({
    startedAt: IsoUtc, finishedAt: IsoUtc, durationMs: z.int().min(0),
    trigger: z.enum(['schedule', 'workflow_dispatch', 'local', 'unknown']),
    sourcesOk: z.int().min(0), sourcesFailed: z.int().min(0),
    itemsTotal: z.int().min(0), itemsNew: z.int().min(0),
  }),
  sources: z.array(SourceHealth),
});
export type Item = z.infer<typeof Item>; export type Meta = z.infer<typeof Meta>;
```
Field names are at Claude's discretion (CONTEXT). The roadmap's required set is fully present: `publishedAt`/`datePrecision`/`firstSeenAt`, cluster fields, `scoreBreakdown`, `schemaVersion`, `lastRunAt`/`lastSuccessAt`, per-source health. Conditional-GET state (ETag) can go in a new `data/state/sources.json` in Phase 2. That is a new file, not a migration.

### Stable serializer (one item per line)
```ts
export function serializeItemsFile(f: ItemsFile): string {
  const lines = f.items.map((it) => '    ' + JSON.stringify(it));
  return `{\n  "schemaVersion": ${f.schemaVersion},\n  "items": [\n${lines.join(',\n')}\n  ]\n}\n`;
}
// sort before serializing: publishedAt desc (nulls last, then firstSeenAt desc), then id asc
```

### Clock store + LIVE island (lint-clean, verified)
```tsx
'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
let clockNow = 0; const listeners = new Set<() => void>(); let timer: ReturnType<typeof setInterval> | undefined;
function subscribeClock(cb: () => void) {
  listeners.add(cb);
  if (!timer) { clockNow = Date.now(); timer = setInterval(() => { clockNow = Date.now(); listeners.forEach((l) => l()); }, 30_000); }
  return () => { listeners.delete(cb); if (!listeners.size && timer) { clearInterval(timer); timer = undefined; } };
}
const getClock = () => clockNow || (clockNow = Date.now());
const getServerClock = () => null;           // server/hydration → "verificando"

export function LiveStatus({ initialLastSuccessAt }: { initialLastSuccessAt: string | null }) {
  const now = useSyncExternalStore(subscribeClock, getClock, getServerClock);
  const [lastSuccessAt, setLast] = useState(initialLastSuccessAt);
  const [pollFailed, setPollFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch('/data/meta.json', { cache: 'no-store' });
        if (!r.ok) throw new Error(String(r.status));
        const parsed = MetaPollSchema.safeParse(await r.json());   // pick({ lastSuccessAt }) of Meta
        if (!parsed.success) throw new Error('invalid');
        if (alive) { setLast(parsed.data.lastSuccessAt); setPollFailed(false); }
      } catch { if (alive) setPollFailed(true); }                  // keep last known value
    };
    void poll();
    const id = setInterval(() => { if (document.visibilityState === 'visible') void poll(); }, 60_000);
    const onVis = () => { if (document.visibilityState === 'visible') void poll(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  const state = now === null ? 'verificando' : liveStatus(lastSuccessAt, now);   // pure fn, unit-tested
  /* render per UI-SPEC */
}
```
Import a slim `Meta.pick({ lastSuccessAt: true })` schema into the client. That is zod in the client bundle (a few KB, acceptable), or use a hand check for `typeof === 'string'` + `Date.parse`.

### Pure status and format functions (src/lib/live-status.ts)
```ts
export type LiveState = 'live' | 'atrasado' | 'parado';
export function liveStatus(lastSuccessAt: string | null, nowMs: number): LiveState {
  if (!lastSuccessAt) return 'parado';
  const t = Date.parse(lastSuccessAt); if (Number.isNaN(t)) return 'parado';
  const min = Math.max(0, (nowMs - t) / 60_000);            // clock skew → 0
  return min < 90 ? 'live' : min <= 180 ? 'atrasado' : 'parado';
}
// formatRelative: <1 min "agora mesmo"; <60 "há N min"; <24h "há N h"; else "há 1 dia"/"há N dias"
// (use differenceInMinutes/Hours/Days — NOT formatDistance, per UI-SPEC)
// formatAbsolute: format(new Date(iso), 'dd/MM HH:mm', { in: tz('America/Sao_Paulo') }) → "06/10 14:17"
// item date: datetime → 'dd/MM/yyyy · HH:mm' in Sao_Paulo; day → 'dd/MM/yyyy' in UTC; null → "Data não informada"
```
Verified outputs: `2026-10-06T17:17:00Z` → `06/10 14:17` and `06/10/2026 · 14:17`.

### check-static.ts
```ts
import { readFileSync } from 'node:fs';
const prerender = JSON.parse(readFileSync('.next/prerender-manifest.json', 'utf8'));
const appRoutes = JSON.parse(readFileSync('.next/app-path-routes-manifest.json', 'utf8'));
const staticRoutes = new Set(Object.keys(prerender.routes));
const dynamic = Object.values<string>(appRoutes).filter((r) => !staticRoutes.has(r));
if (dynamic.length) { console.error('Dynamic routes found:', dynamic); process.exit(1); }
console.log(`All ${Object.keys(appRoutes).length} app routes are static.`);
```
Verified on next@16.3.8: the clean app gives `[]`, and a page using `headers()` gives `['/dyn']`.

### OpenAI normalization specifics (live feed facts, 2026-10-06)
- 200 `text/xml; charset=utf-8`, 760,851 bytes, **1,247 items** (oldest 2015-12-11), 70 within 30 days, 11 within 7 days. 0 missing `pubDate`, 0 future dates, 0 duplicate links, 1,141 with `<description>`.
- `pubDate` is RFC-822 GMT (`Mon, 05 Oct 2026 15:00:00 GMT`), so `datePrecision: 'datetime'` and `new Date(pubDate).toISOString()`.
- Links include `/index/`, `/academy/`, `/global-affairs/`, `/business/`. Keep them all (no AI gate needed: the whole source is OpenAI).
- `description` is plain text in CDATA. Still truncate to 280 chars, grapheme-safe. Full HTML stripping arrives with DATA-02 in Phase 2.
- `company: 'OpenAI'`, `lang: 'en'`, `kind: 'post'`, `sourceId: 'openai-news'`.
- Phase 1 window: keep `publishedAt >= now - 30d` after merge. The UI takes the first 50.
- `isBackfill`: true for items first seen on a source's first-ever successful run (simple rule; Phase 2 refines).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `next lint` | `eslint` CLI + flat `eslint.config.mjs` | Next 16 | Scaffold `lint` script is `"eslint"` [VERIFIED: scaffold] |
| `dynamic`/`revalidate` segment configs always available | Removed **only** when `cacheComponents` is enabled | Next 16.0 | Keep `cacheComponents` off. `dynamic='error'` works [VERIFIED: build] |
| Wrap-everything `useEffect` state sync | `react-hooks` v7 compiler rules (`set-state-in-effect`) | eslint-plugin-react-hooks 7 | Use `useSyncExternalStore` for external clocks |
| vite-tsconfig-paths plugin | `resolve.tsconfigPaths: true` (Vite 8 native) | Vite 8 / Vitest 5 | No plugin dependency needed [VERIFIED] |
| actions/checkout creds in `.git/config` | creds in `$RUNNER_TEMP` file | checkout v6 | Push still works by default |
| GitHub cron UTC only | optional `timezone:` key on schedule | 2026 | Not needed. Keep UTC [CITED: docs.github.com] |

**Deprecated/outdated in project docs:** the CLAUDE.md row "ESLint 10.12.0" (broken with eslint-config-next 16.3.8). ARCHITECTURE.md's YAML uses checkout@v4/setup-node@v4 and Node 22. Use v7 and 24.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Owner-noreply author+committer commits from GITHUB_TOKEN pushes deploy on Hobby for a public personal repo | Pitfall 2 | Core loop broken. Only D-11's two scheduled runs can prove it. Fallback (Deploy Hook) may share the same check |
| A2 | Commits pushed by GITHUB_TOKEN count as "repository activity" for the 60-day rule | Pitfall 12 | Schedule silently disabled after 60 days. Mitigated by runbook + Phase 10 watchdog |
| A3 | OpenAI RSS is reachable from GitHub-hosted runner IPs | Pitfall 4 | D-01 unsatisfiable. Needs a user decision |
| A4 | `"**": false` in `git.deploymentEnabled` matches slash-containing branch names (minimatch) | vercel.json | Preview deploys on `gsd/*` branches consume quota (low impact; branching_strategy is "none") |
| A5 | `vercel link --yes --project ai-intelligence-hub` creates the project if absent, and `vercel git connect --yes` works once the Vercel GitHub App can see the new repo | Environment | May need a dashboard step by the user (e.g. granting the GitHub App access to the new repo) |
| A6 | Explicit `permissions: contents: write` elevates GITHUB_TOKEN even if the repo default is read-only | collect.yml | The push fails with 403. Fix: repo Settings → Actions → Workflow permissions |
| A7 | Vercel builds via `npm run build` (package.json script) for Next.js | package.json | If it ran `next build` directly, build-views would be skipped and `/data/meta.json` would 404. Verify in the first deploy log, or set the Build Command explicitly |
| A8 | slopcheck verdicts (tool unavailable) | Package audit | Low. All packages are mainstream and were exercised locally |

## Open Questions

1. **Vercel domain alias.** `ai-intelligence-hub.vercel.app` is taken. *Recommendation:* ask the user at the repo/Vercel setup checkpoint. Default to `ai-intelligence-hub-br.vercel.app` (returned 404 → likely free) and add it as a project domain.
2. **What happens if OpenAI blocks the runner?** *Recommendation:* the first manual dispatch is the probe. On a block, pause and ask the user. Do not swap sources silently.
3. **Should a failed-source run commit meta.json?** *Recommendation (discretion):* yes. Commit meta.json with `lastRunAt` advanced, `lastSuccessAt` unchanged and an error in the health record, then fail the job after the push. The LIVE badge degrades honestly, the owner gets the GitHub failure email, and the run is still auditable. Validation failure → write nothing, exit 1.
4. **How do we test the concurrency criterion reliably?** A scheduled run lasts about 60–90 s. *Recommendation:* use a poll script (`gh run list --workflow collect.yml --event schedule --status in_progress`) at about :17–:25 UTC, and dispatch immediately when it appears. The `hold_seconds` input makes a manual-vs-manual rehearsal easy beforehand.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build, collector, tests | ✓ | 24.18.0 (local) | — |
| npm | install | ✓ | 11.16.0 | — |
| git | commits | ✓ | 2.55.0 (identity = owner noreply, verified) | — |
| GitHub CLI `gh` | repo creation, run checks | ✓ but **not on Git Bash PATH**: `/c/Program Files/GitHub CLI/gh.exe` | 2.102.0, logged in as `thalesguimalopes99` (scopes repo, workflow) | Call by full path or prepend it to PATH |
| Vercel CLI | project creation, deploy hooks, `vercel ls` | Not installed globally. `npx vercel@62.4.0` works and is **already logged in as `thalesguimalopes99`**, team `thalesguimalopes99s-projects` (hobby) | 62.4.0 | — |
| Vercel ↔ GitHub login connection | Hobby author check | Unknown (dashboard only) | — | User verifies at vercel.com/account/settings/authentication |
| GitHub repo `thalesguimalopes99/ai-intelligence-hub` | PIPE-05 | Does not exist yet (name free) | — | Create with `gh repo create ... --public --source . --remote origin` (push by @devops) |
| Python/pip (slopcheck) | package audit | ✗ | — | Manual audit table above |
| GitHub runner → openai.com | D-01 | Untested | — | Probe run (Open Question 2) |

**Also verified:**
- `.github/workflows/*` is **not** gitignored (`git check-ignore` exit 1). Only `.github/agents/` is.
- `.env` and `.env.example` are ignored. Both `VERCEL_TOKEN` and `GITHUB_TOKEN` in `.env` are empty, so no stray tokens from other accounts.
- The tracked tree today is 15 planning files + CLAUDE.md. Nothing secret will be published.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.3 (`environment: 'node'`, `resolve.tsconfigPaths: true`) |
| Config file | none yet, so `vitest.config.ts` is created in Wave 0 |
| Quick run command | `npx vitest run --reporter=dot` (< 5 s) |
| Full suite command | `npm run typecheck && npm run lint && npm test && npm run validate:data && npm run build && npm run check:static` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-01 | Schema accepts a normalized fixture item, rejects `javascript:` URL / offset timestamp / score 101 / missing cluster | unit | `npx vitest run tests/schema.test.ts` | ❌ Wave 0 |
| DATA-01 | OpenAI fixture → items all valid; id = 16-hex sha256 of canonical URL, stable across runs; neutral intel fields (D-02) | unit | `npx vitest run tests/normalize-openai.test.ts` | ❌ Wave 0 (+ `tests/fixtures/feeds/openai.xml`) |
| DATA-07 | Meta built for ok / failed source: lastSuccessAt advances only on success; consecutiveFailures increments; errorKind set | unit | `npx vitest run tests/meta.test.ts` | ❌ Wave 0 |
| DATA-08 | Serializer deterministic, one item per line, sorted; parse round-trip | unit | `npx vitest run tests/serialize.test.ts` | ❌ Wave 0 |
| DATA-08 / PIPE-02 | Store: invalid data → nothing written, exit non-zero; unchanged items → items.json bytes untouched; meta always rewritten; tmp+rename | unit (tmp dir) | `npx vitest run tests/store.test.ts` | ❌ Wave 0 |
| DATA-08 | build-views turns `data/` into `public/data/meta.json` (validated); missing data → empty-state meta | unit | `npx vitest run tests/build-views.test.ts` | ❌ Wave 0 |
| PIPE-04 | merge idempotent (`merge(merge(p,n),n) == merge(p,n)`), keeps firstSeenAt, 30-day window | unit | `npx vitest run tests/merge.test.ts` | ❌ Wave 0 |
| FEED-06 | `liveStatus` boundaries 0/89.9/90/180/180.1 min, null, invalid, future (skew); `formatRelative` strings; absolute formats in Sao_Paulo/UTC | unit | `npx vitest run tests/live-status.test.ts` | ❌ Wave 0 |
| PIPE-06 | No dynamic routes | build check | `npm run build && npm run check:static` | ❌ Wave 0 (`scripts/check-static.ts`) |
| PIPE-06 | Lint/typecheck pass | static | `npm run lint && npm run typecheck` | scaffold |
| PIPE-01 | Workflow has cron `17 * * * *` + workflow_dispatch, concurrency no-cancel, `ref: main`, contents: write | static (YAML assertion test) | `npx vitest run tests/workflows.test.ts` (parse YAML text, assert keys) | ❌ Wave 0 |
| PIPE-01/02/03 | Scheduled run commits as owner and Vercel deploys production | **manual/empirical** (live infra) | `gh run list -w collect.yml -e schedule -L 3 --json conclusion,headSha,createdAt`; `git log -3 --format='%an <%ae> / %cn <%ce> %s' origin/main`; `gh api repos/thalesguimalopes99/ai-intelligence-hub/commits/<sha>/status --jq '.statuses[]|{context,state}'`; `npx vercel@62.4.0 ls ai-intelligence-hub --prod` | n/a |
| FEED-06 (live) | Live page time advances; badge polls | **manual** | `curl -s https://<domain>/data/meta.json` vs repo `data/meta.json` lastSuccessAt; browser check with DevTools (no hydration warnings, poll every 60 s) | n/a |
| PIPE-04 (live) | Manual during scheduled → two sequential clean commits, valid JSON | **manual** | dispatch while `gh run list -e schedule -s in_progress` is non-empty; then `git pull && npm run validate:data && git log --oneline -3 -- data/` | n/a |
| PIPE-05 | Repo public & personal; only main deploys | **manual** | `gh repo view thalesguimalopes99/ai-intelligence-hub --json visibility,owner`; `vercel.json` present | n/a |
| PIPE-06 (live) | Data-only commit skips CI | **manual** | `gh run list -w ci.yml --json headSha` does not contain the bot data commit SHA | n/a |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=dot` + `npm run typecheck`
- **Per wave merge:** full suite command above
- **Phase gate:** full suite green **and** D-11 evidence (2 consecutive scheduled runs → commits → production deploys → live time advanced) **and** the concurrency test, before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.ts` (node env, `resolve.tsconfigPaths: true`, include `tests/**/*.test.ts`)
- [ ] `tests/fixtures/feeds/openai.xml`: a trimmed real snapshot (~15 items, including one >30 days old). Never hit live URLs in tests
- [ ] `tests/schema.test.ts`, `normalize-openai.test.ts`, `meta.test.ts`, `serialize.test.ts`, `store.test.ts`, `merge.test.ts`, `build-views.test.ts`, `live-status.test.ts`, `workflows.test.ts`
- [ ] `scripts/check-static.ts`, `scripts/validate-data.ts`
- [ ] Framework install: covered by the Installation block

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No user auth. Static site |
| V3 Session Management | no | — |
| V4 Access Control | yes (CI) | `permissions:` least privilege (`contents: write` in collect, `contents: read` in ci). No `pull_request_target`. Deploy Hook URL (if used) only as an Actions secret |
| V5 Input Validation | yes | zod on all collector output and all build-time reads. `z.httpUrl()` (http/https only). Plain-text title/excerpt. React escaping. **No `dangerouslySetInnerHTML`** |
| V6 Cryptography | minimal | `node:crypto` sha256 for ids only (not security-relevant) |
| V10 Malicious code / supply chain | yes | `npm ci` from a committed lockfile. Pinned major action tags (`@v7`). No unapproved install scripts |
| V14 Configuration | yes | No secrets needed in Phase 1. `.env` stays gitignored. Public repo contents reviewed |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stored XSS / `javascript:` links from feed | Tampering | `z.httpUrl()`, text rendering only, `rel="noopener noreferrer"` + `target="_blank"` per UI-SPEC |
| Script injection in workflow via feed text | Elevation | Never interpolate `${{ }}` of feed-derived strings into `run:`. Pass via `env:`. Commit message uses only timestamp + validated integer |
| Corrupted/partial JSON deployed | Tampering / DoS | Validate-then-atomic-write. Build fails on invalid data, so the last good deployment stays live |
| Hostile/huge feed response | DoS | ky timeout + `totalTimeout`. Size cap on body (e.g. 5 MB, since OpenAI is 0.76 MB). Job `timeout-minutes: 10` |
| Fork PR exfiltrating secrets | Info disclosure | `pull_request` (not `_target`). No secrets in ci.yml |

## Sources

### Primary (HIGH confidence)
- Local probe: create-next-app@16.3.8 scaffold output (package.json, tsconfig, eslint.config.mjs, layout, globals.css, CLAUDE.md/AGENTS.md); `next build` with TS 6.0.3/React 19.3.0; `dynamic='error'` failure; manifest-based dynamic detection; ESLint 10 crash; react-hooks `set-state-in-effect`; vitest tsconfigPaths; feedsmith on the live feed; zod 4 behaviours; date-fns tz output; normalize-url output.
- npm registry (`npm view`): versions, peerDependencies (typescript-eslint `<6.1.0`, eslint-plugin-react `eslint ^9.7`), postinstall scripts, download counts.
- https://unpkg.com/next@16.3.8/dist/server/lib/generate-agent-files.js: AGENTS.md/CLAUDE.md upsert logic.
- https://openai.com/news/rss.xml: live request (200, 1,247 items, Cloudflare headers).
- `gh api user` (id 215318905), `gh auth status`, `npx vercel@62.4.0 whoami / teams ls / project ls`, curl of `*.vercel.app` names.
- https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config and /docs/app/guides/caching-without-cache-components (v16.3.8).
- https://vercel.com/docs/git (2026-09-18), /docs/deployments/troubleshoot-project-collaboration, /docs/deploy-hooks (2026-09-16), /docs/cli/deploy-hooks, /docs/cli/git, /docs/project-configuration/git-configuration (2026-08-25), /kb/guide/why-aren-t-commits-triggering-deployments-on-vercel (2026-07-28).
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows: GITHUB_SHA semantics, 60-day rule, default branch.
- https://github.com/actions/checkout README; https://github.com/stefanzweifel/git-auto-commit-action README ("won't handle ... rebasing or pulling").

### Secondary (MEDIUM confidence)
- Vercel Community threads 37045 (Mar–Jun 2026, "could not associate the committer") and 35446 (author access, reconnect fix).
- Stale-checkout reports: github.com/hivecommons/docs/issues/235, github.com/F1Lllewellyn/f1-data-publisher/pull/117, github.com/rm-hull/news-barge/pull/48.

### Tertiary (LOW confidence)
- Community statements that only commits reset the 60-day timer (cronuru, steadycron guides). GITHUB_TOKEN specifics are undocumented.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. Installed, built, linted and tested locally with the exact versions.
- Architecture/patterns: HIGH for code. MEDIUM-HIGH for the workflow (the stale-SHA fix is documented semantics plus multiple reports; not yet run on a real runner).
- Platform behaviour (Hobby author check, 60-day keepalive, runner reachability of OpenAI): MEDIUM/LOW. Empirical proof is the phase's exit gate (D-11).

**Research date:** 2026-10-06
**Valid until:** 2026-10-20 (fast-moving: Next 16.x patch cadence, TS 7 JS-API status, Vercel Hobby policy)
