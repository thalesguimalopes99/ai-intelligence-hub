<!-- GSD:project-start source:PROJECT.md -->
## Project

**AI Intelligence Hub**

Site público, responsivo e mobile-first (dark mode) que centraliza novidades de Inteligência Artificial vindas de fontes confiáveis — labs oficiais, pesquisa, newsletters e comunidades — num feed cronológico com filtros, destaques e ranking por relevância. Atualiza sozinho de hora em hora na nuvem (GitHub Actions → JSON → deploy Vercel), sem servidor, sem banco, sem API paga e sem depender do computador do dono. Para qualquer pessoa que acompanha IA (público aberto, interface em PT-BR) — e para o próprio dono usar como primeira aba do dia, fonte de pautas de conteúdo e base para decidir ferramentas.

**Core Value:** O feed tem que estar **sempre atualizado e confiável sozinho**: coleta horária que nunca cai por causa de uma fonte com erro, sem duplicatas, e com o link certo para a fonte original. Se todo o resto falhar, isso precisa funcionar.

### Constraints

- **Custo**: zero — sem APIs pagas, sem servidor pago — requisito explícito
- **Tech stack**: Next.js + TypeScript + Tailwind CSS; collector em Node/TS no mesmo repo — preferência do usuário
- **Infra**: GitHub (repo público) + GitHub Actions (coleta) + Vercel (hosting) — nuvem, sem máquina local
- **Storage**: arquivos JSON versionados no repo — sem banco na v1
- **Integridade de fontes**: nunca inventar URL de feed; toda fonte verificada por requisição real; limitação documentada quando não houver integração simples
- **Resiliência**: uma fonte com erro não pode derrubar o processo
- **Conteúdo**: só metadados + trecho curto + link (direitos autorais)
- **Visual**: sem imagem gerada por IA — design em código/SVG/CSS
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## TL;DR (prescriptive)
- **Runtime:** Node.js **24 LTS** everywhere: GitHub Actions, Vercel and `engines`. Do not use 26 yet. It is still "Current" until its late-October LTS promotion, and Vercel only offers 20/22/24. Vercel deprecated Node 20 on 2026-10-01.
- **Site:** Next.js **16.3.x** App Router, React **19.3**, TypeScript **6.0.3** (**not** 7.x), Tailwind CSS **4.3** through `@tailwindcss/postcss`.
- **Rendering:** use the default `next build` on Vercel and keep every route fully static (SSG). Do **not** set `output: 'export'`. Write "export-compatible" code anyway (no server actions, no request-time APIs), so switching to static export later is a one-line change.
- **Collector:** `tsx` runner, `ky` (timeout + retry + Retry-After), `feedsmith` (RSS/Atom/RDF/JSON Feed), `cheerio` (HTML), `fast-xml-parser` (sitemap.xml), `zod` 4 (schemas shared with the site), `normalize-url` (canonical URLs), `p-limit` (concurrency), `node:crypto` (hashing). Title similarity is a hand-written token Dice/Jaccard with no dependency.
- **Tests:** Vitest **5**.
- **Dates:** `date-fns` **4** + `@date-fns/tz` + the `ptBR` locale.
- **CI:** `actions/checkout@v7`, `actions/setup-node@v7` (npm cache), `stefanzweifel/git-auto-commit-action@v7`, `concurrency: { group: collect, cancel-in-progress: false }`, cron at an off-minute (`17 * * * *`) plus `workflow_dispatch`.
- **Deploy:** Vercel Git integration on `main` only (`git.deploymentEnabled`). Data commits **must be authored/committed under the owner's GitHub identity**, because Hobby blocks deployments from commits it cannot associate with the owner.
## Recommended Stack
### Core Technologies
| Technology | Version (verified 2026-10-06) | Purpose | Why Recommended | Confidence |
|------------|-------------------------------|---------|-----------------|------------|
| Node.js | **24.x LTS "Krypton"** (24.21.0) | Runtime for the collector, the build and Vercel | It is the Active LTS and the default on Vercel (supported: 24.x default, 22.x, 20.x). Vitest 5 needs `^22.12 \|\| ^24 \|\| >=26`, and ky/p-retry need `>=22`, so 24 satisfies everything. Pin it with `"engines": { "node": "24.x" }` and `.nvmrc`. | HIGH |
| Next.js | **16.3.8** (`latest`) | Site framework (App Router) | User preference and the current stable major. Needs Node >=20.9 and React ^19. Turbopack is the default bundler. Fully static routes are served from Vercel's CDN with no function invocations. | HIGH |
| React / React DOM | **19.3.0** | UI | Peer of Next 16. | HIGH |
| TypeScript | **6.0.3** (pin `~6.0.3`) | Types for the site and the collector | **TS 7.0 (the Go-native compiler, `latest` = 7.0.2) ships without the JS compiler API.** Next.js type-checks through that API and only supports TS 7 behind `experimental.useTypeScriptCli` (added in the 16.3 preview). TS 6.0 is the last JS-based release, and it is fully supported. Revisit when TS 7.1 ships the API (expected within months). | HIGH (multiple sources incl. Next.js maintainer post) |
| Tailwind CSS | **4.3.3** + `@tailwindcss/postcss` 4.3.3 | Styling | v4 uses CSS-first config (`@import "tailwindcss";` and `@theme` in CSS, no `tailwind.config.js` by default) and the Oxide engine, and it is what `create-next-app` scaffolds. Dark mode only: define the palette as `@theme` tokens and skip toggle machinery. | HIGH |
| Zod | **4.6.5** | Runtime schema for `Item`, `Meta` and `SourceStatus`, shared by the collector and the site | One schema serves as the collector's output validator ("the run fails if the JSON is invalid") and the site's input contract, and `z.infer` provides the TS types. Zod 4 is the current major: faster, smaller, with `z.iso.datetime()` and `z.url()`. | HIGH |
### Collector Libraries
| Library | Version | Purpose | When / How to Use | Confidence |
|---------|---------|---------|-------------------|------------|
| **feedsmith** | **3.0.1** | Parse RSS 0.9x/2.0, Atom 0.3/1.0, RDF and JSON Feed | Actively maintained (published 2026-09). Typed, lenient with malformed feeds, case-insensitive. Supports the Dublin Core, content and Media RSS namespaces and also the **arXiv namespace**. Call `parseFeed(xml)`, which returns `{ format, feed }`. Write one small mapper per format (RSS `items` vs Atom `entries`). It does not fetch, which is fine because ky handles fetching. | HIGH (npm + README) |
| **ky** | **2.1.0** | HTTP client: per-request timeout and retry with exponential backoff, honours `Retry-After` | Built on native `fetch`, with zero deps. Defaults: `timeout` 10 s, `retry.limit` 2, retries on 408/413/429/5xx and network errors. **Set `retry.maxRetryAfter` (e.g. 15 000 ms)**: the default is `Infinity`, so a Reddit or arXiv 429 with a large `Retry-After` could stall the run. Set `retry.jitter: true` and `retryOnTimeout: true` for this use case. Create one `ky.create({ headers: { 'user-agent': 'AI-Intelligence-Hub/1.0 (+https://github.com/<owner>/<repo>)' } })`. | HIGH (README) |
| **cheerio** | **1.2.0** | Parse server-rendered HTML (anthropic.com/news, ai.meta.com/blog) | The de-facto jQuery-like server-side HTML parser (parse5/htmlparser2). Use `cheerio.load(html)` with selectors. Keep selectors in one config object per source so a layout change is a one-line fix. Requires Node >=20.18.1. | HIGH |
| **fast-xml-parser** | **5.11.2** | Parse `anthropic.com/sitemap.xml` (`<loc>` + `<lastmod>`) | Already a transitive dependency of feedsmith. A sitemap is not a feed, so parse it directly. | HIGH |
| **normalize-url** | **9.0.1** | Canonical URL for dedupe: strip `utm_*`, `www.`, trailing slash, sort query, force https | Covers exactly the rules in PROJECT.md (`removeQueryParameters: [/^utm_\w+/i, 'ref', 'fbclid', 'gclid']`, `stripWWW: true`, `removeTrailingSlash: true`, `stripHash: true`). ESM-only, which is fine with tsx. | HIGH |
| **p-limit** | **7.3.3** | Cap concurrent fetches (~6) | ~25 sources fired at once is fine for the runner, but limiting concurrency makes it less likely to look like a bot burst, and lets arXiv/Reddit run through a `pLimit(1)` lane with a delay. Use it together with `Promise.allSettled`. | HIGH |
| `node:crypto` (built-in) | — | `createHash('sha256').update(canonicalUrl).digest('hex').slice(0, 16)` → stable `id` | No dependency needed. | HIGH |
| Title similarity (in-house) | — | Cross-source title dedupe | About 30 lines. Lower-case, strip punctuation and accents (`normalize('NFKD')`), drop stopwords, take token sets, then compute **Sørensen–Dice / Jaccard on word tokens plus character bigrams**. Use a threshold of about 0.6–0.7 and only compare items within ±72 h. This is more explainable and testable than any library. If edit distance is needed, add `fastest-levenshtein@1.0.16` (stable, finished, no deps). | MEDIUM (threshold must be tuned on real data) |
### Site Libraries
| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|------------|
| **date-fns** | **4.4.0** | Relative times ("há 3 horas"), formatting, windowing (48 h / 7 d / 30 d) | Tree-shakable and immutable, with the `ptBR` locale built in. v4 has first-class time zone support. | HIGH |
| **@date-fns/tz** | **1.5.0** | Render in `America/Sao_Paulo` and bucket months for `archive/AAAA-MM.json` | Use `TZDate`. Store all timestamps as **UTC ISO strings**, and only convert at display or bucketing time. | HIGH |
| **lucide-react** | 1.52.0 | Icons (SVG, no generated imagery) | Optional but the standard choice. Tree-shakes per icon. | HIGH |
| **clsx** | 2.1.1 | Conditional class names | Optional. Add `tailwind-merge` only if you build a variant-based component kit. | HIGH |
| *(no data-fetching lib)* | — | Poll `meta.json` every ~60 s for the LIVE badge | A ~25-line `useEffect` + `setInterval` + `visibilitychange` hook with `fetch('/data/meta.json', { cache: 'no-store' })`. SWR 2.5.1 works too, but it is a dependency for a single call site. | HIGH |
| `@vercel/analytics` | 2.0.1 | Page analytics | Optional and free on Hobby. Defer it. | MEDIUM |
### Development Tools
| Tool | Version | Purpose | Notes | Confidence |
|------|---------|---------|-------|------------|
| **tsx** | **4.23.15** | Run `scripts/collect.ts` directly (`tsx scripts/collect.ts`) | esbuild-based, with no type-check step (run `tsc --noEmit` separately in CI) and no build output. **Why not Node 24's native type stripping:** it cannot handle extensionless imports, `tsconfig` `paths` (`@/lib/schema`) or enums. The collector shares modules with the Next app, which uses extensionless and aliased imports, so tsx avoids that friction. | HIGH |
| **Vitest** | **5.0.3** (Vite 8.3 peer) | Unit tests: normalizers, canonical URL, dedupe, classifier, scorer, parsers against **fixture files** | Native ESM/TS with zero config and a Jest-compatible API. Test parsers against saved HTML/XML fixtures in `tests/fixtures/`, never live URLs. Use `environment: 'node'`. Component tests are not needed in v1. | HIGH |
| ESLint | 10.12.0 + `eslint-config-next` 16.3.8 | Lint | Uses flat config (`eslint.config.mjs`). Next 16 removed `next lint`, so run `eslint .` directly (MEDIUM: verify the scaffold output). | MEDIUM |
| Prettier | 3.9.9 (+ `prettier-plugin-tailwindcss`) | Formatting / class sorting | Optional. | HIGH |
| `@types/node` | 26.x types are fine, or pin `^24` to match the runtime | Node types | **TS 6 defaults `types: []`**, so add `"types": ["node"]` in the collector tsconfig or it will not see `process`/`Buffer`. | HIGH |
### CI / Hosting
| Component | Version / Setting | Purpose | Confidence |
|-----------|-------------------|---------|------------|
| `actions/checkout` | **v7** (7.0.1) | Check out with push credentials | HIGH |
| `actions/setup-node` | **v7** (7.0.0) | Node 24 plus **npm cache** (`cache: npm`, keyed on `package-lock.json`) | HIGH |
| `stefanzweifel/git-auto-commit-action` | **v7** (7.2.0) | Commit and push `public/data/**` only if there are changes. Exposes the `changes_detected` output. Needs `permissions: contents: write`. | HIGH |
| GitHub-hosted runner | `ubuntu-latest` | Free and unlimited for public repos | HIGH |
| Vercel | Hobby, Git integration, Node 24.x | Build and CDN | HIGH |
## Installation
# Scaffold (App Router, TS, Tailwind v4, ESLint, src/ dir, alias @/*)
# Pin TS to 6.x (create-next-app may resolve typescript@latest = 7.x!)
# Shared + collector
# Site extras (optional)
# Tests
## Rendering mode decision: default build with full SSG, not `output: 'export'`
| Criterion | Default `next build` on Vercel (all routes static) | `output: 'export'` |
|---|---|---|
| Output on Vercel | Static HTML on CDN, 0 function invocations if no dynamic routes | Static HTML on CDN |
| `headers()` / `redirects()` in next.config (cache headers for `/data/*.json`) | Work | Ignored (build warns) |
| Future escape hatch (OG image route, an `/api/feed.xml` route handler prerendered at build) | Available | Only if fully static |
| `next/image` optimization | Available (not needed, no images) | Must use `unoptimized` |
| Portability to GitHub Pages / any static host | Needs the flip | Ready |
| `useSearchParams` for filters | Needs a `<Suspense>` boundary (same in both) | Same |
## GitHub Actions: reference workflow
# .github/workflows/collect.yml
- `timeout-minutes: 10` is a hard ceiling so a hung fetch cannot burn the run. Per-request timeouts (ky, 10–15 s) plus a global `AbortSignal.timeout(240_000)` budget in the collector prevent hangs in the first place.
- Run `tsc --noEmit` and `vitest run` in a **separate** `ci.yml` on `push`/`pull_request` (paths-ignore `public/data/**`), not inside the hourly job, to keep the hourly path minimal.
- GitHub cron is best-effort (5–30 min of delay is normal). The site's LIVE threshold of 90 min already allows for this.
- Commits by the workflow count as repository activity and keep the schedule from being auto-disabled after 60 days (MEDIUM: community-confirmed, consistent with GitHub docs saying only commits count).
## Vercel: deploying and avoiding redundant builds
- Hobby allows **100 deployments/day** and **1 concurrent build**, with 45 min max build time.
- **Ignored Build Step builds still count toward the deployment quota and the concurrency slot.** They save build minutes, not deployments.
- If a commit SHA has already been deployed, no new deployment is created.
- `github.autoJobCancelation` (default on) cancels a queued build when a newer commit lands, so it never builds stale intermediate commits.
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| feedsmith 3 | `@rowanmanning/feed-parser` 2.1.5 (maintained, resilient, normalizes RSS/Atom into one shape) | If you prefer one unified item shape over per-format mappers. It is a solid choice too, but feedsmith has the arXiv namespace and broader format coverage. |
| ky 2 | native `fetch` + `AbortSignal.timeout()` + `p-retry` 8 | If you want zero HTTP dependencies. You then have to implement Retry-After handling yourself. |
| cheerio | `linkedom` 0.18 / `node-html-parser` 9 | linkedom if you need DOM APIs (`querySelector`, `textContent`) or Readability. node-html-parser if raw speed matters. Neither applies here. |
| tsx | Node 24 `--experimental-strip-types` (stable type stripping) | Only if the collector is fully self-contained, uses `.ts` extensions in imports, and has no path aliases or enums. |
| TypeScript 6.0 | TypeScript 7.0 with `experimental.useTypeScriptCli` | Once Next.js marks TS 7 support stable or TS 7.1 ships the JS API. A 10x faster typecheck is not worth it for a small repo today. |
| Vitest 5 | `node:test` | If you want zero test dependencies. Vitest's watch mode, snapshots and TS/ESM support are worth the dependency. |
| date-fns 4 | `Intl.DateTimeFormat` + `Intl.RelativeTimeFormat` only | Viable with zero dependencies. date-fns saves the arithmetic and windowing helpers. |
| Default Vercel build | `output: 'export'` + GitHub Pages | If you leave Vercel. The code is already export-compatible. |
| git-auto-commit-action | Hand-written `git add/commit/push` step | Same result. The action gives `changes_detected` for free. |
| Vercel Git integration | Deploy Hook / `vercel deploy --prebuilt` from Actions | If the Hobby commit-author block cannot be resolved with the owner identity. |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **TypeScript 7.x** (today's npm `latest`!) | No JS compiler API, so it breaks Next.js type-checking without an experimental flag. `create-next-app`/`npm i typescript` will pull it by default. | `typescript@~6.0.3` |
| `rss-parser` | Last published April 2023, bundles the old `xml2js`, loosely typed, and still appears in most tutorials. | feedsmith |
| `string-similarity` | **Deprecated on npm** ("Package no longer supported"). | In-house Dice/Jaccard, or `fastest-levenshtein` |
| `axios`, `node-fetch`, `request` (deprecated), `got` | axios/node-fetch duplicate native fetch; `request` is dead; got 16 is heavy for ~25 GETs. | ky (or native fetch) |
| `moment`, `dayjs` + plugins | moment is in maintenance mode and mutable. dayjs needs plugins for tz and relative time. | date-fns 4 + @date-fns/tz |
| Puppeteer/Playwright in v1 | 300+ MB download per hourly run, slow and fragile. Anthropic and Meta serve links in server HTML (verified). | cheerio. Playwright stays a v2 option for The Batch only. |
| `output: 'export'` on Vercel | Loses `headers()` for cache control on `/data/*.json` and gains nothing on Vercel. | Default build, all routes static |
| ISR / `revalidate` / Vercel Cron to refresh data | Hobby cron is 1x/day, and ISR adds functions and invocations. Data changes arrive via commit and rebuild anyway. | Commit → rebuild |
| Importing `items.json` in client components | Ships the whole 30-day dataset in the JS bundle. | Server Component render plus a slim client island |
| A database / KV (Supabase, Upstash, Vercel KV) | Out of scope. JSON in git is the source of truth and the audit log. | `public/data/*.json` |
| `tailwind.config.js` v3-style setup | Tailwind 4 is CSS-first, and v3 guides and `npx tailwindcss init` no longer apply. | `@import "tailwindcss"` + `@theme` in `globals.css` |
| `cancel-in-progress: true` on the collect workflow | Can kill a run between writing JSON and pushing, leaving partial state. | `cancel-in-progress: false` |
## Stack Patterns by Variant
- Keep it in the source list with `enabled: true, weight: low, failSoft: true`, give it a `pLimit(1)` lane, `retry.limit: 1` and `maxRetryAfter: 5000`
- Because a datacenter-IP block is a source status to report in `meta.json`, not an error to retry aggressively
- Space requests about 3 s apart (arXiv's API terms ask for one request every 3 s), and prefer the RSS listing (`rss.arxiv.org/rss/cs.AI`) plus HF Daily Papers as the curated signal
- Because arXiv throttles aggressively and volume (~400/day) needs a cap anyway
- Switch to a Deploy Hook triggered from the workflow (`curl -fsS -X POST "$VERCEL_DEPLOY_HOOK"` stored as a repo secret)
- Because deploy hooks deploy the branch head regardless of the git push author (MEDIUM: validate)
## Version Compatibility
| Package | Compatible With | Notes |
|---------|-----------------|-------|
| next@16.3.8 | react/react-dom ^19 (19.3.0), Node >=20.9 | Turbopack default. Use `eslint-config-next@16.3.8` (peer eslint >=9). |
| next@16.3.x | **typescript 6.0.x** | TS 7 only via `experimental.useTypeScriptCli`. Do not use it. |
| typescript@6.0 | — | Defaults changed: `strict: true`, **`types: []`** (list `"node"` explicitly), `module: esnext`, `rootDir: "."`. `baseUrl` and `moduleResolution: node10` are deprecated, so use `moduleResolution: "bundler"` with `paths` only. |
| tailwindcss@4.3.3 | @tailwindcss/postcss@4.3.3, postcss ^8.5 | Keep the two versions identical. |
| vitest@5.0.3 | vite ^6 \|\| ^7 \|\| ^8 (8.3.2), Node ^22.12 \|\| ^24 \|\| >=26, @types/node ^22 \|\| >=24 | |
| ky@2.1.0, p-retry@8 | Node >=22 | ESM-only. Fine with `"type": "module"` + tsx. |
| cheerio@1.2.0 | Node >=20.18.1 | |
| feedsmith@3.0.1 | Node >=14, bundles fast-xml-parser ~5.11 | v3 has breaking changes from v2, so ignore v2-era tutorials. |
| normalize-url@9, p-limit@7 | ESM-only | |
| actions/setup-node@v7 | node24 action runtime | v7 removed the dummy `NODE_AUTH_TOKEN` (irrelevant here: no registry publish). |
## Sources
- npm registry (`npm view <pkg> version engines peerDependencies dist-tags`, run 2026-10-06): next 16.3.8, react 19.3.0, tailwindcss 4.3.3, typescript latest=7.0.2 / 6.0.3, zod 4.6.5, feedsmith 3.0.1, ky 2.1.0, cheerio 1.2.0, tsx 4.23.15, vitest 5.0.3, date-fns 4.4.0, @date-fns/tz 1.5.0, normalize-url 9.0.1, p-limit 7.3.3, fast-xml-parser 5.11.2; `string-similarity` flagged deprecated; rss-parser last modified 2023-04. HIGH
- https://nodejs.org/dist/index.json: Node 24.21.0 is LTS "Krypton", 26.x is Current. HIGH
- GitHub releases API: actions/checkout v7.0.1, actions/setup-node v7.0.0, git-auto-commit-action v7.2.0. HIGH
- https://github.com/actions/setup-node (README): v6 auto npm cache via `packageManager`, v7 breaking change. HIGH
- https://github.com/stefanzweifel/git-auto-commit-action (README): `commit_user_*`, `commit_author`, `changes_detected`, `contents: write`. HIGH
- https://github.com/sindresorhus/ky (readme): retry defaults, `maxRetryAfter: Infinity` default, `retryOnTimeout`. HIGH
- https://github.com/macieklamberski/feedsmith (README): formats and namespaces incl. arXiv, `parseFeed`. HIGH
- Context7 `/vercel/next.js`: static export config, unsupported features, `headers/redirects` warning with `output: 'export'`, `useSearchParams`. HIGH
- https://vercel.com/docs/limits: Hobby 100 deployments/day, 1 concurrent build, 45 min build, deploy hooks 60/h. HIGH
- https://vercel.com/docs/project-configuration/project-settings#ignored-build-step: canceled builds count toward quota. HIGH
- https://vercel.com/docs/project-configuration/git-configuration: `git.deploymentEnabled` branch matching, `github.autoJobCancelation`. HIGH
- https://vercel.com/docs/functions/runtimes/node-js/node-js-versions: 24.x default, 22.x, 20.x. HIGH
- https://vercel.com/kb/guide/why-aren-t-commits-triggering-deployments-on-vercel and Vercel Community threads ("commit author does not have contributing access… Hobby teams do not support collaboration", bot authors treated as collaborators). MEDIUM
- https://x.com/timneutkens/status/2076771696745345363, https://github.com/vercel/next.js/discussions/95633, windowsforum/ecorpit articles: TS 7.0 lacks JS API; Next 16.3 `experimental.useTypeScriptCli`. MEDIUM-HIGH
- https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html (via search summaries): TS 6 default changes (`types: []`, strict). MEDIUM-HIGH
- https://github.com/orgs/community/discussions/148632 and related: bot commits count as activity for the 60-day schedule rule. MEDIUM
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

| Skill | Description | Path |
|-------|-------------|------|
| aiox-commit | > Create a local conventional commit for AIOX work. Never pushes. Use when: committing, /aiox-commit, or local git commit. | `.claude/skills/aiox-commit/SKILL.md` |
| apply-qa-fixes | > Apply QA gate findings then hand back for re-review. Never self-approves or closes. Use when: apply QA fixes, remediate gate FAIL/CONCERNS, /apply-qa-fixes. | `.claude/skills/apply-qa-fixes/SKILL.md` |
| architect-first | Guide for implementing the Architect-First development philosophy - perfect architecture, pragmatic execution, quality guaranteed by tests. Use this skill when starting new features, refactoring systems, or when architectural decisions are needed. Enforces non-negotiables like complete design/documentation before code, zero coupling, and validation by multiple perspectives before structural decisions. | `.claude/skills/architect-first/SKILL.md` |
| checklist-runner | \| Generic checklist execution engine for any .md checklist. Use this skill when an agent needs to validate work against a checklist. Supports YOLO (autonomous) and interactive modes with pass/fail/partial verdicts. | `.claude/skills/checklist-runner/SKILL.md` |
| close-story | > Finalize bookkeeping for a story already completed by QA. Never changes lifecycle status. Use when: close story, *close-story, story Done, /close-story. | `.claude/skills/close-story/SKILL.md` |
| coderabbit-review | \| Unified CodeRabbit CLI execution via WSL with self-healing loop. Use this skill when running automated code review before commits, PRs, or QA gates. Handles WSL wrapper, severity filtering, and auto-fix iterations. | `.claude/skills/coderabbit-review/SKILL.md` |
| develop-story | > Implement a story (Ready → InProgress → ready for review). Runs the OSS develop task. Use when: develop story, *develop, /develop-story, implement ACs. | `.claude/skills/develop-story/SKILL.md` |
| full-sdc | > EXECUTE lean Full Story Development Cycle for one story: plan via CLI, run validate → develop → review (QG loop) → close with Sequence Lock, durable progress under .aiox/sdc/. Use when: full-sdc, full cycle, SDC, run story end-to-end. | `.claude/skills/full-sdc/SKILL.md` |
| mcp-builder | Guide for creating high-quality MCP (Model Context Protocol) servers that enable LLMs to interact with external services through well-designed tools. Use when building MCP servers to integrate external APIs or services, whether in Python (FastMCP) or Node/TypeScript (MCP SDK). | `.claude/skills/mcp-builder/SKILL.md` |
| review-story | > QA gate for a story — verdict PASS/CONCERNS/FAIL/WAIVED + lifecycle transition. Use when: review story, qa gate, *qa-gate, /review-story. | `.claude/skills/review-story/SKILL.md` |
| skill-creator | Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends Claude's capabilities with specialized knowledge, workflows, or tool integrations. | `.claude/skills/skill-creator/SKILL.md` |
| synapse | "This skill should be used when users want to understand the SYNAPSE context engine, manage domains, configure context rules, or troubleshoot rule injection. Use when asked about SYNAPSE architecture, domain management, star-commands, context brackets, or the 8-layer processing pipeline." | `.claude/skills/synapse/SKILL.md` |
| tech-search | \| Self-contained deep tech research. WebSearch + WebFetch + Haiku workers. Pipeline: Query > Decompose > Parallel Search (Haiku) > Evaluate > Synthesize > Document. Zero external dependencies. MCPs optional. Salva em docs/research/{YYYY-MM-DD}-{slug}/. | `.claude/skills/tech-search/SKILL.md` |
| validate-story-draft | > Validate a story draft (Draft → Ready on GO). Runs the OSS PO validation task. Use when: validate story, *validate-story-draft, /validate-story-draft, story readiness. | `.claude/skills/validate-story-draft/SKILL.md` |
| wave-execute | > EXECUTE a lean wave — plan story DAG + file-ownership batches via CLI, dispatch full-sdc per story, fan-in check, hand off merge to @devops. Use when: wave-execute, run wave, epic wave, parallel stories SDC. | `.claude/skills/wave-execute/SKILL.md` |
| aiox-analyst | Business Analyst (Atlas). Use for market research, competitive analysis, user research, brainstorming session facilitation, structured ideation workshops, feasibility studies, i... | `.codex/skills/aiox-analyst/SKILL.md` |
| aiox-architect | Architect (Aria). Use for system architecture (fullstack, backend, frontend, infrastructure), technology stack selection (technical evaluation), API design (REST/GraphQL/tRPC/We... | `.codex/skills/aiox-architect/SKILL.md` |
| aiox-data-engineer | Database Architect & Operations Engineer (Dara). Use for database design, schema architecture, Supabase configuration, RLS policies, migrations, query optimization, data modelin... | `.codex/skills/aiox-data-engineer/SKILL.md` |
| aiox-dev | Full Stack Developer (Dex). Use for code implementation, debugging, refactoring, and development best practices | `.codex/skills/aiox-dev/SKILL.md` |
| aiox-devops | GitHub Repository Manager & DevOps Specialist (Gage). Use for repository operations, version management, CI/CD, quality gates, and GitHub push operations. ONLY agent authorized... | `.codex/skills/aiox-devops/SKILL.md` |
| aiox-master | AIOX Master Orchestrator & Framework Developer (Orion). Use when you need comprehensive expertise across all domains, framework component creation/modification, workflow orchest... | `.codex/skills/aiox-master/SKILL.md` |
| aiox-pm | Product Manager (Morgan). Use for PRD creation (greenfield and brownfield), epic creation and management, product strategy and vision, feature prioritization (MoSCoW, RICE), roa... | `.codex/skills/aiox-pm/SKILL.md` |
| aiox-po | Product Owner (Pax). Use for backlog management, story refinement, acceptance criteria, sprint planning, and prioritization decisions | `.codex/skills/aiox-po/SKILL.md` |
| aiox-qa | Test Architect & Quality Advisor (Quinn). Use for comprehensive test architecture review, quality gate decisions, and code improvement. Provides thorough analysis including requ... | `.codex/skills/aiox-qa/SKILL.md` |
| aiox-sm | Scrum Master (River). Use for user story creation from PRD, story validation and completeness checking, acceptance criteria definition, story refinement, sprint planning, backlo... | `.codex/skills/aiox-sm/SKILL.md` |
| aiox-squad-creator | Squad Creator (Craft). Use to create, validate, publish and manage squads | `.codex/skills/aiox-squad-creator/SKILL.md` |
| aiox-ux-design-expert | UX/UI Designer & Design System Architect (Uma). Complete design workflow - user research, wireframes, design systems, token extraction, component building, and quality assurance | `.codex/skills/aiox-ux-design-expert/SKILL.md` |
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
