# Pitfalls Research

**Domain:** Serverless AI-news aggregator (hourly GitHub Actions collector, JSON committed to a public repo, Next.js static site on Vercel Hobby)
**Researched:** 2026-10-06
**Confidence:** MEDIUM-HIGH. Platform limits were checked against official docs (GitHub, Vercel, arXiv). Scraping structure was checked with live HTTP from a residential IP, not from a GitHub runner. The Reddit, Cloudflare and Vercel-author findings come from several community sources that agree with each other.

> Suggested phase names used below (the roadmapper may rename them):
> **P1 Collector Core** (fetch, parse, normalize, isolate failures) ·
> **P2 Dedupe/Classify/Score** ·
> **P3 Storage & Pipeline** (Actions workflow, commit-back, Vercel deploy) ·
> **P4 Site Feed & Filters** ·
> **P5 Live/Status/History pages** ·
> **P6 Hardening & Ops** (monitoring, alerts, fixtures, docs)

---

## Critical Pitfalls

### Pitfall 1: Vercel Hobby silently refuses to deploy bot-authored commits

**What goes wrong:**
The Action commits `items.json` as `github-actions[bot]`, and Vercel blocks the deployment with "The Deployment was blocked because the commit author does not have contributing access to the project on Vercel". The collector looks healthy and the data is in the repo, but the live site never changes. LIVE turns "atrasado" for good. The `meta.json` on the site is honest about it, but the Core Value is broken.

**Why it happens:**
Hobby has no collaboration. Vercel checks that the latest commit's author is the account owner, matching the Git email exactly (plus-addresses count as different identities). This applies to public repos too. Using a Deploy Hook does not get around it, because the check reads the author of the commit (per community reports).

**How to avoid:**
- In the workflow, set `git config user.name/user.email` to the **owner's GitHub identity**: the exact email linked to the Vercel account, or the owner's `ID+user@users.noreply.github.com` if that is the linked one. Do this before committing. Test it on day 1.
- Fallback A: deploy from the Action with the Vercel CLI and a `VERCEL_TOKEN` secret (`vercel pull && vercel build --prod && vercel deploy --prebuilt --prod`), and turn off Git auto-deploy for data commits. LOW-MEDIUM confidence that CLI token deploys skip the author check. Verify before relying on it.
- Fallback B (architecture): the site fetches data at runtime from `raw.githubusercontent.com`, which has about a 5-minute cache. Then data commits don't need deploys at all.
- Also confirm the repo sits under the **personal account, not a GitHub Organization**. Vercel Hobby cannot connect to org-owned repos (official limits page).

**Warning signs:** Vercel dashboard shows "Blocked" or no deployment for bot commits. `lastUpdated` in the repo's `meta.json` is newer than the one served by the site.

**Phase to address:** P3. It must be proven in the first end-to-end "walking skeleton" before any UI work.

---

### Pitfall 2: "Silent zero": a scraper breaks and still reports `ok`

**What goes wrong:**
Anthropic or Meta changes its markup. The selector matches nothing, the adapter returns `[]` without throwing, the source status stays "ok", and the source quietly disappears from the feed for weeks. The same thing happens when a site returns a Cloudflare/bot-challenge page with HTTP 200, or a cookie wall.

**Why it happens:**
"No error thrown" gets treated as success. Anthropic's `/news` uses **hashed CSS-module class names** (seen live: `SiteHeader-module-scss-module__zKj4Ca__header`), and these change on every Anthropic deploy. Selectors copied from DevTools break within weeks.

**How to avoid:**
- Select by **semantic, stable anchors**, never by class: `a[href^="/news/"]` (Anthropic) and `a[href^="https://ai.meta.com/blog/"]` (Meta, which currently renders absolute links in server HTML). Use `<time datetime>`, `og:` / `article:published_time` meta and JSON-LD for dates.
- For Anthropic, use **sitemap.xml as the primary discovery channel** (structured, stable) and the `/news` HTML as a secondary one. Treat `lastmod` as "possibly changed", **not** as the publish date (see Pitfall 7).
- Add a per-adapter **sanity contract**: `items.length >= minExpected` (e.g. Anthropic ≥ 5 links on the listing), every item has a parseable URL and title, and the response is not a challenge page (look for `cf-chl`, `Just a moment`, `captcha`, or a body shorter than N KB). If the contract fails, the status is `error: "parser_contract"`, **not** `ok`, and the previous items are kept.
- Keep **fixture-based tests**: save a real HTML snapshot under `fixtures/`, unit-test the parser, and refresh the snapshot on purpose.
- Add a **staleness alarm**: if a source with a historical cadence of about 1 post per week has 0 new items for N× its median interval, mark it `stale` on the status page.
- When a source has been in error for 24h or more, the Action opens or updates a GitHub Issue automatically using `gh issue create`, deduplicated by label.

**Warning signs:** item count per source drops to 0 or 1 with no error; status page all green but no Anthropic item in 14+ days.

**Phase to address:** P1 (contracts, semantic selectors), P6 (fixtures, staleness, auto-issue).

---

### Pitfall 3: GitHub Actions cron is not a clock. Delays, dropped runs, and the 60-day disable

**What goes wrong:**
- `schedule` runs late. GitHub's docs say "high load times include the start of every hour" and that queued jobs may be dropped under enough load. In July 2026 community reports showed **3–7 hour delays and whole missed runs** (community discussion #201472). The LIVE indicator (< 90 min) then shows "atrasado" through no fault of the code.
- Scheduled workflows only run on the **default branch**.
- In public repos, scheduled workflows are **auto-disabled after 60 days without repository activity**. Sources disagree on whether workflow-made commits count as activity. The `gh-action-keepalive` action relies on a workflow commit to keep things alive, which suggests they do, but treat this as unconfirmed. A run of "nothing changed → no commit" days, or a long outage, can also trigger the disable.

**Why it happens:** It's a best-effort shared scheduler, and everyone schedules `0 * * * *`.

**How to avoid:**
- Schedule at an **odd minute** (e.g. `17 * * * *`), not `0 * * * *`.
- Optionally add a **second trigger**: a free external pinger (e.g. cron-job.org) that calls `workflow_dispatch` through the REST API with a fine-grained PAT that has only `actions:write`. Pair it with concurrency (Pitfall 4) so both triggers can't run at the same time.
- Make `meta.json` record `lastRunAt` (every run) **and** `lastSuccessAt`, so the site can tell a scheduler delay apart from a collector failure.
- Set LIVE's threshold to the real cadence. With cron jitter plus a 1–3 min build, **90 min will flap** often. Use something like `< 90 min = LIVE`, `90–180 = "atrasado"`, `> 180 = "parado"`, and display the absolute time.
- Keepalive: commit `meta.json` on every successful run, even when no new items arrived (it naturally changes because of `lastRunAt`). Document the manual re-enable step in `docs/`.

**Warning signs:** gaps in the Actions run history; the "Disabled" banner in the Actions tab; `lastRunAt` gaps > 2h.

**Phase to address:** P3 (cron minute, meta fields), P5 (LIVE thresholds), P6 (external trigger, runbook).

---

### Pitfall 4: Race conditions on commit-back (lost updates and rejected pushes)

**What goes wrong:**
A scheduled run and a manual `workflow_dispatch` (or a delayed run that overlaps the next one) both read the old `items.json`, merge, and push. The second push is rejected as non-fast-forward, so the run fails and alerts fire. Or, if someone "fixes" it with `--force`, one run's items get overwritten. Separately, the owner pushes a code change during a run, and the bot push gets rejected.

**How to avoid:**
- `concurrency: { group: collector, cancel-in-progress: false }`. **Don't** cancel in-progress runs, because a half-done run is just wasted time. Note the default `queue: single` behavior: only one pending run is kept, and newer pending runs replace older ones, which is fine here. Never combine `queue: max` with `cancel-in-progress: true` (validation error).
- Use the **read → merge → write → commit → `git pull --rebase` → push** pattern with a retry loop (3 attempts). On rebase conflict in data files, re-run the merge step on top of the fresh remote state instead of resolving the conflict textually. The collector's merge must be **idempotent** (keyed by item id).
- Humans never edit `data/*.json` by hand. Put data in a dedicated folder and keep code changes out of the bot's commit (`git add data/` only).
- `permissions: contents: write` explicitly in the workflow. New repos default `GITHUB_TOKEN` to read-only.

**Warning signs:** `! [rejected] main -> main (fetch first)` in logs; items appearing and then vanishing between runs.

**Phase to address:** P3.

---

### Pitfall 5: `GITHUB_TOKEN` commits don't trigger other workflows

**What goes wrong:**
You add a "validate JSON / run tests on push" workflow, or a downstream "build archive" workflow on `push`. It never runs for bot commits. Official docs: "With the exception of `workflow_dispatch` and `repository_dispatch`, other `GITHUB_TOKEN`-triggered events do not create workflow runs."

**How to avoid:** Do validation **inside the collector job, before committing** (schema check with zod, `JSON.parse` round-trip, size check). If chaining is really needed, use `workflow_call` (reusable workflow) in the same run, or call `workflow_dispatch` explicitly. Vercel is not affected, because its GitHub App webhook still sees the push. Pitfall 1 still applies.

**Phase to address:** P3.

---

### Pitfall 6: Feed date handling: missing, malformed, future, re-published, wrong timezone

**What goes wrong:**
- **Missing dates** (scraped pages, some Atom entries): falling back to `now()` on the **first/backfill run** stamps 200+ old posts as "just published". The feed, Destaques and "Top da semana" fill with year-old content.
- **Malformed dates**: RFC-822 variants (`Tue, 6 Oct 2026 14:00:00 PDT`, `GMT+0`, two-digit years, localized month names, `2026-10-06 14:00:00` without a zone). `new Date()` returns `Invalid Date`, which serializes to `null`, and sorting puts the item first or last. Feedsmith deliberately returns raw strings for this reason; `@rowanmanning/feed-parser` returns `Date | null`.
- **Date-only values** from scraping (Anthropic listing shows `Sep 28, 2026`; Meta shows `April 08, 2026`, verified live). Parsed as UTC midnight, they show as "Sep 27, 21:00" in São Paulo, so the wrong day appears in the UI and in period filters.
- **Future dates** (timezone bugs, scheduled posts) pin an item to the top for hours.
- **Re-published/edited posts**: some feeds bump `pubDate`/`updated` on edits, and Atom `updated` ≠ `published`. Old posts jump back to the top as "new".

**How to avoid:**
- Store `publishedAt` (source claim, nullable), `datePrecision: "datetime" | "date" | "none"`, and `firstSeenAt` (collector). Sort by `publishedAt ?? firstSeenAt`.
- Mark the **first run per source as backfill**: items without a date get `firstSeenAt = null`, or a date far in the past, and are excluded from Destaques/Top/"Em alta".
- **Freeze** `publishedAt` once an item is stored. Later edits don't move it. Prefer Atom `published` over `updated`.
- Clamp `publishedAt > now + 1h` to `firstSeenAt`. Reject dates before 2000 as garbage.
- Render date-only values as dates (no time) in `America/Sao_Paulo`. Parse them as **noon UTC**, or keep them as a date string, to avoid day shift.
- Use one tested date-parse helper with a fixture table of ugly real-world strings.

**Warning signs:** many items with identical timestamps equal to a run time; items dated "today" whose URL contains an old slug or year; items dated in the future.

**Phase to address:** P1 (parsing, schema), P2 (backfill exclusion in score).

---

### Pitfall 7: Treating sitemap `lastmod` as the publication date

**What goes wrong:** Anthropic's sitemap has about 262 `/news/` URLs with `lastmod`. Edits, CMS migrations or site-wide redeploys can bump `lastmod` on dozens of old URLs at once, and they all flood in as "new".

**How to avoid:** Use the sitemap only for **discovery** of URLs not seen before. For a new URL, fetch the article page once and read the publish date from `article:published_time`, JSON-LD `datePublished`, or the visible date. Cap the number of article fetches per run (e.g. 10), and keep a `seenUrls` set (the existing items/archive is enough) so old URLs are never re-fetched. On the first run, seed `seenUrls` from the whole sitemap as backfill without surfacing those items.

**Phase to address:** P1.

---

### Pitfall 8: arXiv volume swamps everything (and the etiquette rules)

**What goes wrong:**
- `cs.AI` RSS has about 400 items/day. At 30 days that's about 12k items, which dwarfs the roughly 30 lab posts and bloats `items.json`, the client payload and git history. Rule-based keywords fire constantly on paper abstracts ("agent", "model", "LLM"), so papers dominate category pages and even Destaques.
- The RSS includes `arxiv:announce_type` values `new`, `cross`, `replace`, `replace-cross`. Without filtering, revisions show up as duplicates of papers you already have.
- Announcements happen once per weekday (about 20:00 US Eastern). There are no items on weekends or holidays, which isn't a failure. A naive staleness check will flag it.
- arXiv ToU: **"no more than one request every three seconds, and limit requests to a single connection at a time"** for the legacy APIs (API, RSS, OAI-PMH). Parallel `Promise.all` over categories breaks this. Polling the RSS 24×/day when it changes once a day is wasteful.

**How to avoid:**
- Treat **HF Daily Papers as the main paper signal**. Ingest arXiv only for `announce_type=new`, and only when it matches strong keywords or appears in HF Daily Papers. Hard cap per day (e.g. 15–25) by score. Keep arXiv items out of the 48h Destaques entirely, or give them a source-weight ceiling.
- Normalize arXiv identity to the **bare ID without version** (`2410.01234`, dropping `v2`, `abs/` vs `pdf/`, `export.arxiv.org` vs `arxiv.org`). HF paper pages map to the same ID, so dedupe across sources by `arxivId`.
- Serialize arXiv requests (sequential with ≥ 3s sleep). Fetch arXiv **only on 1–2 runs per day** (e.g. after 01:00 UTC), or use a conditional GET (`If-Modified-Since`/ETag).
- Link to the **abstract page** (arXiv explicitly asks for this), not the PDF.

**Phase to address:** P1 (fetch etiquette, announce_type), P2 (cap, score ceiling), P3 (schedule gating).

---

### Pitfall 9: Reddit: blocked, disallowed, and the API is closed to new apps

**What goes wrong:**
- Anonymous `.rss` from datacenter/cloud IPs gets 429/403, SSL handshake timeouts, or an outright IP block. GitHub-hosted runners are Azure IPs. The project's own probe already saw `r/artificial = 429` and `.json = 403`. Community reports describe it as an IP block, not a rate threshold, so slower polling doesn't help.
- **reddit.com/robots.txt is `User-agent: * / Disallow: /`** (verified 2026-10-06), and its Public Content Policy restricts automated use.
- The official OAuth API **stopped self-service app creation in November 2025** (Responsible Builder Policy). New apps need manual approval, which often takes a long time or never comes.
- Reddit RSS has no scores, so it can't feed "Em alta" meaningfully. Posts are often link reposts of lab news, which inflates multi-source coverage boosts (Pitfall 12).

**How to avoid:** Keep Reddit **off by default** in v1 (feature flag). If enabled: weight it lowest, exclude it from coverage boosts, set a strict 10s timeout with no retries on 403/429 (retrying only makes things worse), and treat failure as a known state that is documented on the status page, not as an "error" that alarms. Document the robots.txt/policy situation in `docs/SOURCES.md`. Do not try to get around blocks with proxies or residential-IP services, because that breaks the "no paid API / honest sourcing" constraints and Reddit policy.

**Phase to address:** P1 (fail-soft adapter), P6 (docs).

---

### Pitfall 10: XSS and link injection from untrusted feed content

**What goes wrong:** Feed titles and descriptions contain HTML (`<img onerror>`, `<script>`, `<iframe>`), and links can be `javascript:` or `data:` URIs. A malicious or compromised feed, or a Reddit post title, ends up running script on your domain. Rendering excerpts with `dangerouslySetInnerHTML` "to keep formatting" is the classic hole. Lower-profile risks: misleading lookalike URLs, and `target="_blank"` without `rel="noopener"`.

**How to avoid:**
- **Sanitize at collection time, store plain text only**: strip all tags, decode entities, collapse whitespace. Then React escapes on render. Never use `dangerouslySetInnerHTML` for feed data.
- Validate every URL with `new URL()`. Allow only `http:`/`https:` and drop the item otherwise. React 19 blocks `javascript:` hrefs, but don't depend on that alone.
- External links get `rel="noopener noreferrer nofollow"`.
- Add a strict CSP (`default-src 'self'`, no inline script beyond what Next needs) through `next.config` headers.
- Don't hotlink third-party images from feeds (privacy, tracking pixels, mixed content, copyright). The design is code/SVG anyway.

**Phase to address:** P1 (sanitize in normalizer), P4 (rendering rules, CSP).

---

### Pitfall 11: Dedupe false positives and false negatives

**False negatives (duplicates leak through):**
- URL variants: `http`/`https`, `www`, trailing slash, `utm_*`, `ref=`, `?source=rss` (Substack), `#fragment`, AMP versions, `/en-us/` locale prefixes on Microsoft pages, arXiv `abs`/`pdf`/version suffixes, tracking redirects in newsletters (TLDR links wrap targets with utm parameters).
- The same announcement on several owned channels: OpenAI blog, `openai-python` release, GitHub changelog, TLDR, Reddit. URLs differ and titles differ ("Introducing GPT-X" vs "OpenAI releases GPT-X with…").
- Feed GUIDs that change when a post is edited, which makes items reappear as new.

**False positives (distinct items merged):**
- Title-similarity collisions on templated titles: "Release v1.52.0" across different SDK repos, "What's new in Copilot (October)", "Changelog 2026-10-06", "This week in AI", "AI News #123".
- "Introducing Gemini 3" vs "Introducing Gemini 3 Flash": high similarity, different products.
- **Over-aggressive URL normalization**: stripping *all* query strings merges different items on sites that use `?id=` or `?p=`, YouTube `?v=`, or HN `item?id=`.

**How to avoid:**
- URL canonicalization with a **denylist** of tracking params (`utm_*`, `ref`, `source`, `fbclid`, `gclid`, `mc_*`), not a blanket strip. Lowercase the host and drop `www`, but keep path case. Honor `<link rel="canonical">` when you scraped the page anyway.
- **Stable id = hash(canonicalUrl)**. Version the normalization function (`idVersion`). Changing the rules later without migrating re-IDs every stored item and creates a wave of duplicates in the archive.
- Title similarity is used **only to group into "stories"** (the coverage cluster), never to delete. Require: same 72h window AND similarity ≥ threshold on normalized titles (lowercase, stripped punctuation/stopwords) AND distinct source AND **no conflicting version/model tokens** (numbers, "mini", "flash", "pro", "v1.2"). Exclude release-feed and changelog items from fuzzy grouping, or prefix their titles with the repo name.
- Keep a test file of real known-duplicate and known-distinct pairs and run it in CI.

**Phase to address:** P2.

---

### Pitfall 12: Rule-based classification and score are fooled by keyword collisions

**What goes wrong:**
- **Ambiguous terms:** "agent" (real-estate, FBI, *user agent*, travel agent), "model" (business model, role model, data model, fashion model), "API" (everywhere in github.blog), "transformer" (electrical), "diffusion", "Gemini" (zodiac/constellation), "Claude" (person name), "Llama" (animal), "Mistral" (wind), "Phi", "Grok", "Sora", "Copilot" (several Microsoft products), short model ids `o1`, `o3`, `R1`, `4o`, `V3` matching random tokens and versions.
- **Substring matches without word boundaries:** "AI" in "said", "maintain", "Taiwan"; "GPT" in "ChatGPT" (fine) vs "LLM" in URLs.
- **Mixed-topic sources** (about.fb.com, news.microsoft.com, github.blog, engineering.fb.com) need an **AI-relevance gate**. Otherwise HR, earnings, and Instagram feature posts enter as "Business".
- **Lab-source bias**: everything from an AI lab is AI, but not everything is a "launch". Anthropic's listing contains customer stories (seen live: `/news/barclays-scales-claude`, `/news/accenture-embedded-evaluation`) and policy posts. These score as "launch + model name".
- **Coverage boost inflation**: TLDR AI, Reddit and Latent Space echo lab posts, so every lab post gets "multi-source" and "Em alta" stops meaning anything. Releases feeds (`openai-python` ships "release: 1.x.y" frequently) flood "API" and score as "launch".
- **Frozen age decay**: if the score with decay is computed once at collection and stored, a 6-day-old item keeps its day-0 score, so "Top da semana" and Destaques go wrong.
- **Score drift**: tuning weights changes only new items, and old ones keep old scores.

**How to avoid:**
- Word-boundary, case-aware regexes (`\bagents?\b`) **plus context co-occurrence** for ambiguous terms (e.g. "agent" counts only with AI context terms like LLM/AI/model/tool-use/autonomous, or when the source is an AI-only source). Model-name dictionary with explicit patterns (`\bGPT-\d`, `\bClaude (Opus|Sonnet|Haiku)\b`, `\bLlama ?\d`), not bare words.
- Two-stage pipeline: (1) **relevance gate** for mixed sources (must match ≥ N strong AI terms in the title, or title+excerpt), (2) categorization.
- Penalties driven by URL/title patterns: `/customers/`, "case study", "scales Claude", "webinar", "event", "careers", "hiring", "join us".
- Coverage boost counts **distinct primary-source publishers only**. Aggregators/communities (TLDR, Reddit, Latent Space) add a small capped bonus.
- Releases feeds: only **minor/major** semver bumps (or releases whose notes mention a new model/endpoint) are eligible for "launch"; patch releases get low weight.
- Store **score components** (sourceWeight, boosts[], penalties[], coverage) and compute the **final score, including decay, deterministically every run for all items in the window**, or in the client at render time. Version the rules config (`scoringVersion`).
- Keep a **golden test set**: ~100 hand-labeled real items with expected categories and score bands. Run it in CI on every rules change.
- Show "por que este score" (component breakdown) in a tooltip. This builds trust and makes debugging easier.

**Warning signs:** "Agents" category containing real-estate or security news; Destaques showing customer stories; > 50% of items in one category.

**Phase to address:** P2 (rules, gate, golden set), P5 (score explanation UI).

---

### Pitfall 13: Encoding and XML parsing quirks

**What goes wrong:**
- `fetch().text()` always decodes as **UTF-8**. Feeds declared as `ISO-8859-1` or `windows-1252` in the XML prolog (common in older WordPress) turn into mojibake (`Ã©`, `â€™`).
- A **UTF-8 BOM** or leading whitespace/newline before `<?xml` makes strict parsers fail ("XML declaration allowed only at start").
- **Double-encoded entities** (`&amp;amp;`, `&amp;#8217;`), HTML named entities not defined in XML (`&nbsp;`, `&mdash;`), and unescaped `&` in titles all break strict XML parsers.
- Bare control characters (U+0000–U+001F) in descriptions, which are invalid in XML 1.0.
- A server returns an HTML error page or a Cloudflare challenge with status 200 and `Content-Type: text/html`, and the parser throws a confusing error, or worse, "succeeds" with 0 items.
- Atom vs RSS vs RDF (RSS 1.0) differences: `<link href>` attribute vs text node, several `<link rel>` values (alternate/self/enclosure), `xml:base`-relative links, `guid isPermaLink="false"` being used as the URL.
- Gzip/brotli is fine in Node fetch, but **very large feeds** (Microsoft Research full-content) slow parsing. Some feeds return 10+ MB of `content:encoded`.

**How to avoid:**
- Fetch as `arrayBuffer`. Detect the charset from the `Content-Type` header, then the XML prolog, then default to UTF-8, and decode with `TextDecoder`. Strip the BOM and leading whitespace.
- Use a **lenient parser**: `feedsmith` or `@rowanmanning/feed-parser` (both built for real-world invalid feeds). Avoid strict DOM XML parsers.
- Link resolution order: Atom `link[rel=alternate]`, then RSS `<link>`, then `guid` if `isPermaLink != false`. Always pass the result through `new URL(link, feedUrl or xml:base)` to absolutize it.
- Check the content type and sniff the body before parsing. Treat "HTML where XML expected" as `error: "not_a_feed"`.
- Cap the response size (e.g. 5 MB) and keep only the first N entries (e.g. 50).

**Phase to address:** P1.

---

### Pitfall 14: HTML-in-description excerpts are ugly or too long

**What goes wrong:** Excerpts contain raw tags, image alt text, "The post X appeared first on Y." (WordPress boilerplate), "Continue reading →", Substack "Subscribe now" or "Listen now" blocks, footnote markers, or several paragraphs of full content (`content:encoded`), which is also a copyright problem (Pitfall 15). Truncating in the middle of an HTML entity or a surrogate pair/emoji produces broken characters.

**How to avoid:** Use `description`/`summary` over `content:encoded`. Run: HTML → text (convert block elements to spaces, drop `figure`, `img`, `script`, `style`), decode entities, apply per-source boilerplate regexes, collapse whitespace, then **truncate by grapheme** (`Intl.Segmenter`) at a word boundary to about 240 characters and add "…". If the excerpt is just the title repeated, drop it.

**Phase to address:** P1.

---

### Pitfall 15: Copyright, ToS and excerpt length

**What goes wrong:** Storing or showing full article text, long excerpts, or images. Scraping sites whose terms forbid automated collection. Not crediting sources.

**Specifics found:**
- **ai.meta.com robots.txt** allows `/blog/` but has the header comment *"Collection of data on Facebook through automated means is prohibited unless you have express written permission"*. This is a ToS risk for the Meta scraper. Prefer Meta's own RSS feeds (engineering.fb.com, about.fb.com) as the main Meta channel and keep the ai.meta.com scrape minimal (listing page only: title, URL, date; no article bodies; once per run at most, or less often).
- **anthropic.com robots.txt**: `Allow: /` with a sitemap (verified). Low risk.
- **reddit.com**: `Disallow: /` (see Pitfall 9).
- Legal frame (LOW-MEDIUM confidence; not legal advice): Brazil's Lei 9.610/98 art. 46, III allows quoting passages "na medida justificada para o fim a atingir" with author and source named. US fair use favors short, transformative snippets plus a link. The EU press-publisher right (DSM Art. 15) exempts "very short extracts". All three point the same way: **title + about 1–2 sentences (≤ ~250 chars) + prominent source/brand + link to the original**.

**How to avoid:** Hard cap on excerpt length in the schema (validated by zod). Never store `content:encoded`. No third-party images. Every card names the source and links to the original (Core Value). Add an "Sobre/Fontes" page with a takedown contact and a list of sources. Keep `docs/SOURCES.md` noting each source's robots/ToS status.

**Phase to address:** P1 (schema caps), P5/P6 (about page, SOURCES.md).

---

### Pitfall 16: The LIVE indicator lies

**What goes wrong:**
- **Stale cache shows "LIVE"**: the indicator is computed from `lastUpdated` baked into the HTML at build time and never re-read, or the client re-fetches `meta.json` but a browser cache, service worker or CDN returns the old copy. The age is shown relative to the old value, but the "LIVE" label was computed at build time.
- **Fresh timestamp, broken data**: the collector bumps `lastUpdated` even when every source failed, or 80% did, so the site says LIVE with no new content.
- **Client clock skew**: a user's phone with the wrong clock sees "atrasado" or "LIVE" incorrectly.
- **Hydration mismatch**: relative time ("há 5 min") is rendered on the server at build time and recomputed on the client, which triggers a React hydration error, or freezes at build-time text.
- **Deploy lag**: data committed at T only goes live at T+2–5 min (Vercel build). The worst case for "Vercel blocked" is Pitfall 1.

**How to avoid:**
- `meta.json` fields: `lastRunAt`, `lastSuccessAt` (≥ X% of sources ok AND JSON valid), `sourcesOk/total`, `buildCommit`. LIVE uses `lastSuccessAt`, not `lastRunAt`.
- The client fetches `/data/meta.json?t=<now>` with `cache: "no-store"` every 60–120s, and recomputes the label only on the client (render a neutral placeholder on the server, or use `suppressHydrationWarning` on the time element).
- Correct for skew using the response `Date` header as "now", or show the absolute time next to the relative one.
- Show degraded states: "LIVE · 3 fontes com erro" links to the status page.

**Phase to address:** P3 (meta schema), P5 (indicator).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Pretty-printed `items.json` rewritten with unstable key or array order | Easy to eyeball | Every hourly commit diffs the whole file, so git history grows tens of MB/month and diffs become unreadable | Never. Use stable sort (by id/date) and stable key order. One item per line, or `JSON.stringify(x, null, 1)` with sorted keys |
| Commit on every run even when only `lastRunAt` changes | Keepalive for the 60-day rule; honest LIVE | 24 deploys/day (within Hobby's 100/day) and more history | Acceptable. Keep the meta change tiny |
| Store the final score including age decay | Simple | Decay frozen, ranking wrong after day 1 | Never. Store components and recompute |
| Selectors from DevTools class names | Fast scraper | Breaks on the next Anthropic deploy (hashed CSS modules) | Never |
| `Promise.all` instead of `allSettled` / no per-source timeout | Less code | One hanging source kills the hourly run | Never (Core Value) |
| Fuzzy-title dedupe that deletes items | Cleaner feed | Distinct launches lost forever | Never delete. Only group |
| Committing archives as one huge file | Simple | 100 MB GitHub hard limit (50 MB warning); slow client loads | Monthly files (already planned). Check size per month |
| No fixtures/tests for parsers | Faster P1 | Every source breakage found by users | MVP only for RSS adapters. Scrapers need fixtures from day 1 |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Vercel Hobby + bot commits | Commit as `github-actions[bot]` | Commit as the owner identity linked to Vercel; verify the first deploy; fallback to CLI deploy or runtime fetch (Pitfall 1) |
| Vercel Hobby + GitHub org | Create the repo under an org | Personal account repo (Hobby can't connect to org repos) |
| Vercel limits | Assume unlimited deploys | Hobby: **100 deployments/day, 100 builds/hour, 1 concurrent build, 45 min max build**. Hourly runs plus your own pushes and preview branches all count |
| Vercel commercial clause | Add AdSense/affiliate links later | Hobby is **non-commercial only** (ads, affiliate-primary, paid work on the site all count). Donations are OK. Owner uses the hub for content creation: keep the site itself free of monetization, or move to Pro |
| GitHub Actions perms | Default token | `permissions: contents: write` (plus `issues: write` for auto-issues) |
| arXiv | Parallel requests, PDF links | ≤ 1 req / 3 s, single connection, link to `/abs/`, filter `announce_type=new` |
| HF Daily Papers API | Assume stable schema, fetch all history | Validate with zod; fetch today (+ yesterday for timezone edges); key by arXiv id |
| GitHub releases.atom | Treat every release as news | Filter prereleases/patch versions; prefix the title with the repo; low weight |
| github.blog / changelog, about.fb.com, news.microsoft.com | Ingest everything | AI-relevance gate (Pitfall 12) |
| OpenAI | Scrape `openai.com/news` | Use **only** `/news/rss.xml`. Community reports show HTML pages behind Cloudflare return 403 to automated clients while the RSS returns 200. Re-verify from a runner; the feed itself could also get challenged |
| Reddit | Anonymous `.json`, retries on 429 | Off by default; RSS only; no retry on 403/429; documented limitation |
| Substack (Latent Space) | Use full content | Use `description`; strip `?utm_source` / `?source=rss` variants |
| TLDR AI | Treat one RSS item as one story | Check whether items are whole daily issues or per-link. If per-issue, store as one "newsletter" item and **don't** let it count as coverage for every story it mentions |
| All sources | Default `node-fetch`/undici UA, or a fake browser UA | Honest UA: `AIIntelligenceHub/1.0 (+https://<site>.vercel.app/sobre; contact)`. Send `If-None-Match`/`If-Modified-Since` (store ETag/Last-Modified in meta) |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Shipping full `items.json` (30d) to the client | Slow first load on mobile; Lighthouse red | Without arXiv capping, 30d can be 10k+ items (several MB). Cap arXiv; split `latest.json` (e.g. 7d / 300 items) from the full window; pre-render the first page statically | At ~2 MB+ JSON on 4G |
| Sequential fetch of 25+ sources with retries | Run takes 10+ min, overlaps the next run | Bounded parallelism (p-limit ~6), per-source timeout 15s, max 2 retries with backoff only on 5xx/network errors, separate serialized lane for arXiv | When a few sources hang |
| Recomputing fuzzy dedupe O(n²) over the whole archive | Run time grows monthly | Compare new items only against the 72h–7d window | At several thousand items |
| Repo history growth | Clone slow, Actions checkout slow | `actions/checkout` with `fetch-depth: 1` (then `git pull --rebase` works with shallow history for fast-forward pushes; use `fetch-depth: 2` if needed); deterministic JSON; GitHub recommends repos < 1 GB (strongly < 5 GB) | Years of hourly commits with unstable JSON |
| Static generation of many history pages | Build time grows each month | Client-side render of archive JSON, or ISR; keep the build well under 45 min (should be < 2 min) | Hundreds of pre-rendered pages |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Rendering feed HTML (`dangerouslySetInnerHTML`) | Stored XSS on the site | Plain text only, sanitized at collection |
| Accepting any URL scheme from feeds/scrapes | `javascript:`/`data:` links | `http(s)` allowlist via `new URL()` |
| `pull_request_target` or untrusted-input workflows in a public repo | Token exfiltration via fork PRs | Collector workflow only on `schedule` + `workflow_dispatch`; no secrets exposed to PR workflows |
| Interpolating feed strings into shell (`run: echo "${{ ... }}"`) | Command injection in Actions | Never pass scraped data through `${{ }}` into `run:`; keep all processing in Node |
| Over-scoped PAT for the external trigger | Repo takeover if leaked | Fine-grained PAT, single repo, `actions:write` only, with expiry |
| Hotlinking feed images | Tracking pixels/privacy, mixed content | No third-party images |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Feed dominated by arXiv/GitHub releases | Signal lost; owner abandons the "primeira aba do dia" | Caps and weights; default view excludes low-weight sources or groups them in "Pesquisa" |
| Times in UTC / wrong day for date-only items | Confusing "ontem/hoje" | `America/Sao_Paulo`, absolute + relative time, date-only shown without a time |
| Empty Destaques on slow days shown as broken | Looks dead | Explicit empty state ("Nenhum grande lançamento nas últimas 48h"), or show the latest major launch with its age |
| Filters not in the URL or not restored on back nav | Can't share or bookmark | Already planned; test back/forward and deep links on mobile |
| Status page shows raw errors (`ECONNRESET`) | Alarming, opaque | PT-BR human labels: "bloqueada pela fonte", "layout mudou", "sem novidades (normal)" |
| Copy/share button producing tracking-param URLs | Ugly, leaks utm | Share the canonical URL |
| Original-language titles with no hint | PT-BR users confused by mixed language | Label source language; keep translation for v2 as planned |

## "Looks Done But Isn't" Checklist

- [ ] **Deploy pipeline:** a bot-made data commit actually produced a Vercel production deployment (not "Blocked"). Verify in the Vercel dashboard after the first scheduled run.
- [ ] **Failure isolation:** kill one source (point it at a 404 or a 30s-hanging URL) and confirm the run succeeds, the old items for that source are kept, and the status is `error`.
- [ ] **Scrapers:** a parse returning 0 items marks `error`, not `ok`.
- [ ] **Backfill:** the first run did not put 200 old posts into "today"/Destaques.
- [ ] **Dates:** fixture table covers RFC-822 with named zones, ISO without zone, date-only, missing, future.
- [ ] **Encoding:** at least one non-UTF-8 or entity-heavy fixture renders correctly (curly quotes, accents).
- [ ] **Dedupe:** "Release v1.2.0" from two different repos are NOT merged; the same OpenAI post via RSS and TLDR IS grouped.
- [ ] **Score:** decay recomputed. An item from 6 days ago has a lower score than at publication.
- [ ] **Classification:** golden set passes; "user agent" and "business model" don't trigger Agents/Models.
- [ ] **LIVE:** with network devtools set to "disable cache" off, the label still updates after a new deploy without reload; no hydration warning in the console.
- [ ] **arXiv:** requests serialized ≥ 3s; replacements filtered; daily cap enforced.
- [ ] **Concurrency:** manually dispatch twice quickly; no rejected push, no lost items.
- [ ] **JSON validity guard:** a deliberately corrupted output fails the run *before* commit.
- [ ] **Size:** `items.json` size logged per run; alert if > N MB.
- [ ] **Docs:** `docs/SOURCES.md` lists each source's method, robots/ToS note and known limitation (Reddit, Meta, The Batch).

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Vercel blocking bot commits | LOW | Change the commit author in the workflow; redeploy; or switch to CLI deploy / runtime fetch |
| Scheduled workflow auto-disabled | LOW | Re-enable in the Actions tab (or `gh workflow enable`); add the external dispatch trigger |
| Scraper broken | LOW-MEDIUM | Status page already shows it; update the selector against a fresh fixture; previous items were kept |
| Normalization change re-IDs everything | MEDIUM | Migration script mapping old→new ids via `idVersion`; dedupe the archive once |
| Polluted feed from bad backfill | MEDIUM | Script to reset `firstSeenAt`/flags for the affected source; recompute scores |
| Repo bloat | MEDIUM-HIGH | Move data history to an orphan `data` branch, or squash data history with `git filter-repo` (rewrites public history; coordinate) |
| Copyright/ToS complaint | LOW | Remove the source via config flag; purge its excerpts; note in SOURCES.md |
| XSS found | MEDIUM | Sanitize in the normalizer, re-run normalization over stored items, add CSP |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Vercel blocks bot commits / org repos | P3 (walking skeleton first) | Production deploy appears for a bot commit |
| 2. Silent-zero scrapers | P1 + P6 | Contract test fails on empty fixture; staleness flag works |
| 3. Cron delay / 60-day disable | P3 + P5 + P6 | `lastRunAt` gaps tracked; odd-minute cron; runbook exists |
| 4. Commit-back races | P3 | Double dispatch test passes |
| 5. GITHUB_TOKEN no-trigger | P3 | Validation runs inside the collector job |
| 6. Dates (missing/future/tz/backfill) | P1 + P2 | Date fixture table; backfill excluded from Destaques |
| 7. Sitemap lastmod ≠ publish date | P1 | Re-run with bumped lastmod fixture yields 0 new items |
| 8. arXiv volume/etiquette | P1 + P2 + P3 | Daily cap logged; requests ≥ 3s apart |
| 9. Reddit blocks/policy | P1 + P6 | Off by default; failure shown as "limitação conhecida" |
| 10. XSS/link injection | P1 + P4 | Malicious fixture renders as inert text; CSP header present |
| 11. Dedupe FP/FN | P2 | Known-pairs test suite |
| 12. Keyword collisions / score drift | P2 + P5 | Golden set; decay recompute; score breakdown visible |
| 13. Encoding/XML quirks | P1 | Non-UTF-8, BOM, HTML-instead-of-XML fixtures |
| 14. Excerpt cleanliness | P1 | Boilerplate fixtures; grapheme-safe truncation |
| 15. Copyright/ToS | P1 + P6 | Schema max length; SOURCES.md robots/ToS column |
| 16. LIVE lies | P3 + P5 | Degraded-state and no-store fetch tests; no hydration warnings |

## Sources

- GitHub Docs: Events that trigger workflows (`schedule` delays at the start of the hour, default branch only, 60-day disable in public repos, GITHUB_TOKEN events don't create runs). HIGH. https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows
- GitHub Docs: Workflow syntax, `concurrency` (pending replacement, `queue: single|max`, incompatibility with cancel-in-progress). HIGH. https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions
- GitHub Community #201472: multi-hour delays and dropped scheduled runs, July 2026. MEDIUM. https://github.com/orgs/community/discussions/201472
- gh-action-keepalive (workflow commit used to beat the 60-day disable). MEDIUM. https://github.com/efrecon/gh-action-keepalive
- Vercel Limits (Hobby: 100 deployments/day, 100 builds/hour, 1 concurrent build, 45 min build, no Git-org repos). HIGH, last_updated 2026-09-16. https://vercel.com/docs/limits
- Vercel Fair Use (Hobby non-commercial definition, ads/affiliate, donations OK). HIGH. https://vercel.com/docs/limits/fair-use-guidelines
- Vercel KB: Why aren't commits triggering deployments (Hobby author/owner check). HIGH. https://vercel.com/kb/guide/why-aren-t-commits-triggering-deployments-on-vercel
- Vercel Community: deployment blocked because commit author lacks access (public repos too, author-email workaround). MEDIUM. https://community.vercel.com/t/vercel-hobby-plan-deployment-blocked-because-commit-author-lacks-access/35446
- arXiv API Terms of Use (1 request / 3 s, single connection, link to abstract pages). HIGH. https://info.arxiv.org/help/api/tou.html
- Reddit anonymous RSS blocked from cloud IPs (429/404/SSL timeouts). MEDIUM. https://github.com/norrietaylor/distillery/issues/642
- Reddit API self-service closed Nov 2025 (Responsible Builder Policy). MEDIUM (multiple secondary sources agree). https://github.com/jordanburke/reddit-mcp-server/issues/29 · https://molehill.io/blog/reddit_killed_self-service_api_keys_your_options_for_automated_reddit_integration
- OpenAI HTML 403 vs RSS 200 for automated clients. MEDIUM. https://github.com/TomiToivio/LaclauGPT-Data-Collection/issues/170 · https://community.n8n.io/t/rss-403-openai-com-news-n8n-cloud/85134
- Feedsmith date handling (raw strings by design). MEDIUM. https://feedsmith.dev/parsing/dates · @rowanmanning/feed-parser (lenient with invalid XML): https://github.com/rowanmanning/feed-parser
- React 19 blocks `javascript:` URLs. MEDIUM. https://github.com/react/react/pull/29808
- Prior-art unofficial Anthropic RSS scrapers (confirms no official feed; useful for selector ideas). MEDIUM. https://github.com/taobojlen/anthropic-rss-feed · https://github.com/Olshansk/rss-feeds
- Live verification 2026-10-06 (from a local machine, not a GitHub runner): anthropic.com/robots.txt `Allow: /`; ai.meta.com/robots.txt anti-scraping notice; reddit.com/robots.txt `Disallow: /`; Anthropic /news uses hashed CSS-module classes and "Mon DD, YYYY" dates and includes customer stories; Meta /blog has absolute links in server HTML and "Month DD, YYYY" dates. HIGH for the snapshot, but it can change.
- Copyright frame (Lei 9.610/98 art. 46; US fair use; EU DSM Art. 15 "very short extracts"). LOW-MEDIUM, from training knowledge, not legal advice.

---
*Pitfalls research for: serverless AI-news aggregator (GitHub Actions → JSON → Vercel)*
*Researched: 2026-10-06*
