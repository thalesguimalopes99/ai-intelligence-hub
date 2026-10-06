# Stack Research

**Domain:** Automated AI-news aggregator: a statically rendered Next.js site, plus an hourly Node/TS collector on GitHub Actions that commits JSON to the repo, with Vercel Hobby deploying from git
**Researched:** 2026-10-06
**Confidence:** HIGH for versions (checked against the npm registry, GitHub releases API and nodejs.org on 2026-10-06). MEDIUM for the Vercel/GitHub operational behaviour (official docs plus community reports).

---

## TL;DR (prescriptive)

- **Runtime:** Node.js **24 LTS** everywhere: GitHub Actions, Vercel and `engines`. Do not use 26 yet. It is still "Current" until its late-October LTS promotion, and Vercel only offers 20/22/24. Vercel deprecated Node 20 on 2026-10-01.
- **Site:** Next.js **16.3.x** App Router, React **19.3**, TypeScript **6.0.3** (**not** 7.x), Tailwind CSS **4.3** through `@tailwindcss/postcss`.
- **Rendering:** use the default `next build` on Vercel and keep every route fully static (SSG). Do **not** set `output: 'export'`. Write "export-compatible" code anyway (no server actions, no request-time APIs), so switching to static export later is a one-line change.
- **Collector:** `tsx` runner, `ky` (timeout + retry + Retry-After), `feedsmith` (RSS/Atom/RDF/JSON Feed), `cheerio` (HTML), `fast-xml-parser` (sitemap.xml), `zod` 4 (schemas shared with the site), `normalize-url` (canonical URLs), `p-limit` (concurrency), `node:crypto` (hashing). Title similarity is a hand-written token Dice/Jaccard with no dependency.
- **Tests:** Vitest **5**.
- **Dates:** `date-fns` **4** + `@date-fns/tz` + the `ptBR` locale.
- **CI:** `actions/checkout@v7`, `actions/setup-node@v7` (npm cache), `stefanzweifel/git-auto-commit-action@v7`, `concurrency: { group: collect, cancel-in-progress: false }`, cron at an off-minute (`17 * * * *`) plus `workflow_dispatch`.
- **Deploy:** Vercel Git integration on `main` only (`git.deploymentEnabled`). Data commits **must be authored/committed under the owner's GitHub identity**, because Hobby blocks deployments from commits it cannot associate with the owner.

---

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

---

## Installation

```bash
# Scaffold (App Router, TS, Tailwind v4, ESLint, src/ dir, alias @/*)
npx create-next-app@16.3 ai-intelligence-hub --ts --tailwind --eslint --app --src-dir --import-alias "@/*"

# Pin TS to 6.x (create-next-app may resolve typescript@latest = 7.x!)
npm i -D typescript@~6.0.3

# Shared + collector
npm i zod@^4.6 date-fns@^4.4 @date-fns/tz@^1.5
npm i -D tsx@^4.23 ky@^2.1 feedsmith@^3.0 cheerio@^1.2 fast-xml-parser@^5.11 normalize-url@^9 p-limit@^7

# Site extras (optional)
npm i lucide-react clsx

# Tests
npm i -D vitest@^5 @types/node@^24
```

Put the collector-only packages (ky, feedsmith, cheerio, etc.) in **devDependencies**. Vercel installs devDependencies for the build, the site never imports them, and the boundary stays visible.

`package.json` essentials:

```json
{
  "type": "module",
  "packageManager": "npm@11",
  "engines": { "node": "24.x" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "collect": "tsx scripts/collect.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

The `packageManager: npm@…` field also turns on setup-node's automatic npm caching (v6+ behaviour).

---

## Rendering mode decision: default build with full SSG, not `output: 'export'`

| Criterion | Default `next build` on Vercel (all routes static) | `output: 'export'` |
|---|---|---|
| Output on Vercel | Static HTML on CDN, 0 function invocations if no dynamic routes | Static HTML on CDN |
| `headers()` / `redirects()` in next.config (cache headers for `/data/*.json`) | Work | Ignored (build warns) |
| Future escape hatch (OG image route, an `/api/feed.xml` route handler prerendered at build) | Available | Only if fully static |
| `next/image` optimization | Available (not needed, no images) | Must use `unoptimized` |
| Portability to GitHub Pages / any static host | Needs the flip | Ready |
| `useSearchParams` for filters | Needs a `<Suspense>` boundary (same in both) | Same |

**Recommendation:** use the default build and make every page static. Read the JSON in **Server Components** at build time with `fs.readFile` (or `import`), and put filtering in a client component driven by `useSearchParams`. Add a `next.config.ts` `headers()` entry giving `/data/meta.json` `Cache-Control: public, max-age=0, must-revalidate` so the LIVE poll sees fresh data after each deploy. Avoid Server Actions, `cookies()`, `headers()` and ISR, which keeps a switch to `output: 'export'` a one-line change if the project ever leaves Vercel. (Confidence: HIGH for the feature matrix from the Next.js docs; the choice is opinion.)

**Data location:** the collector writes to `public/data/items.json`, `public/data/meta.json` and `public/data/archive/AAAA-MM.json`. Server Components read them from disk at build, and the browser can fetch `/data/meta.json` (and archive months on demand) as static files. **Do not import `items.json` into a client component**, because that serializes the whole 30-day window into the JS bundle. Render the list on the server and pass only the slimmed fields to the client filter island.

---

## GitHub Actions: reference workflow

```yaml
# .github/workflows/collect.yml
name: collect
on:
  schedule:
    - cron: '17 * * * *'      # off the top of the hour, when GitHub's scheduler is most congested
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: collect
  cancel-in-progress: false   # never kill a run mid-write; queue instead

jobs:
  collect:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version-file: '.nvmrc'   # 24
          cache: npm
      - run: npm ci
      - run: npm run collect          # exits non-zero only if ALL sources failed or zod validation failed
      - name: Rebase on latest main (avoid push race with human commits)
        run: git pull --rebase --autostash origin main
      - uses: stefanzweifel/git-auto-commit-action@v7
        with:
          commit_message: 'data: hourly collect [bot]'
          file_pattern: 'public/data/**'
          commit_user_name: '<owner-github-username>'
          commit_user_email: '<numeric-id>+<owner-github-username>@users.noreply.github.com'
          commit_author: '<owner-github-username> <<numeric-id>+<owner-github-username>@users.noreply.github.com>'
```

Notes:
- `timeout-minutes: 10` is a hard ceiling so a hung fetch cannot burn the run. Per-request timeouts (ky, 10–15 s) plus a global `AbortSignal.timeout(240_000)` budget in the collector prevent hangs in the first place.
- Run `tsc --noEmit` and `vitest run` in a **separate** `ci.yml` on `push`/`pull_request` (paths-ignore `public/data/**`), not inside the hourly job, to keep the hourly path minimal.
- GitHub cron is best-effort (5–30 min of delay is normal). The site's LIVE threshold of 90 min already allows for this.
- Commits by the workflow count as repository activity and keep the schedule from being auto-disabled after 60 days (MEDIUM: community-confirmed, consistent with GitHub docs saying only commits count).

---

## Vercel: deploying and avoiding redundant builds

Verified facts (Vercel docs, 2026-09):
- Hobby allows **100 deployments/day** and **1 concurrent build**, with 45 min max build time.
- **Ignored Build Step builds still count toward the deployment quota and the concurrency slot.** They save build minutes, not deployments.
- If a commit SHA has already been deployed, no new deployment is created.
- `github.autoJobCancelation` (default on) cancels a queued build when a newer commit lands, so it never builds stale intermediate commits.

The budget is 24 data commits per day plus human pushes, well under 100. Do the following:

1. **Only `main` deploys**, so feature branches do not spend quota on preview builds:
   ```json
   // vercel.json
   {
     "$schema": "https://openapi.vercel.sh/vercel.json",
     "git": { "deploymentEnabled": { "main": true, "*": false } }
   }
   ```
   (When a branch matches several rules and any of them is `true`, it deploys, so `main` deploys and every other branch does not.) If you want PR previews, remove this and accept the quota cost.
2. **The collector only commits when something changed.** `git-auto-commit-action` already skips clean trees. Because `meta.json.lastUpdated` changes every run, in practice every run commits, and that is intended because the LIVE badge depends on it. Never add a second commit per run (for example, separate commits for items and meta).
3. **Ignored Build Step** (Project Settings → Build & Deployment) is only worth it for doc-only human commits: `git diff --quiet HEAD^ HEAD -- src public package.json package-lock.json next.config.ts`. It saves build minutes but **not** deployment quota, so it is low priority.
4. **Commit identity (critical, MEDIUM confidence).** Hobby teams "do not support collaboration": Vercel blocks deployments when the commit author or committer is not the account owner or cannot be associated with a GitHub user. Bot commits (`github-actions[bot]`) are reported as blocked in multiple Vercel community threads, and the official KB only spells out the rule for private repos. **Mitigation:** commit as the owner's GitHub noreply identity (as in the YAML above). **Fallback:** create a Vercel **Deploy Hook** (limit 60 triggers/hour) and `curl -X POST` it from the workflow when `changes_detected == 'true'`, with `git.deploymentEnabled: false` for `main` if you go that route. **Validate this in Phase 1 with a real bot commit before building anything else on top of it.**
5. Pin Node with `engines.node: "24.x"` so Vercel and Actions run the same major.

---

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

**If Reddit returns 429/403 from GitHub runners (likely):**
- Keep it in the source list with `enabled: true, weight: low, failSoft: true`, give it a `pLimit(1)` lane, `retry.limit: 1` and `maxRetryAfter: 5000`
- Because a datacenter-IP block is a source status to report in `meta.json`, not an error to retry aggressively

**If arXiv API (`export.arxiv.org/api/query`) is used:**
- Space requests about 3 s apart (arXiv's API terms ask for one request every 3 s), and prefer the RSS listing (`rss.arxiv.org/rss/cs.AI`) plus HF Daily Papers as the curated signal
- Because arXiv throttles aggressively and volume (~400/day) needs a cap anyway

**If the Vercel Hobby commit-author block appears on bot commits:**
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

---
*Stack research for: automated AI-news aggregator (Next.js static site + GitHub Actions collector + Vercel Hobby)*
*Researched: 2026-10-06*
