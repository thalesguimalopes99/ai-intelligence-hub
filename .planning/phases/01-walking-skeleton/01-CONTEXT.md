# Phase 1: Walking Skeleton - Context

**Gathered:** 2026-10-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Prove the full delivery loop end-to-end before any feature work. A **scheduled** (off-minute cron) GitHub Actions run collects one real source, commits data plus `meta.json` to `main` under the owner's identity, and that commit produces a Vercel production deploy. The live `*.vercel.app` page then shows an advancing "última atualização" and a LIVE/atrasado/parado badge. The complete shared zod schema is defined now so later phases need no data migration. CI covers code changes.

Requirements: PIPE-01..06, DATA-01, DATA-07, DATA-08, FEED-06.

Out of this phase: multi-source resilience, dedupe, archive (Phase 2); real design (Phase 4); classification, clustering and scoring (Phases 5–7).

</domain>

<decisions>
## Implementation Decisions

### Collector content
- **D-01:** The Phase 1 collector fetches **one real source: OpenAI RSS** (`https://openai.com/news/rss.xml`, verified 200). It parses and normalizes the feed into the full schema so `items.json` holds real, schema-valid data from day one. Phase 2 broadens to all sources with failure isolation.
- **D-02:** Intelligence fields exist in the schema but are filled with **neutral values**: `categories: []`, no primary category, cluster as a self/singleton (or null), `score: 0`, and a zeroed `scoreBreakdown`. They are not optional and not omitted, and Phases 5–7 fill them in.

### Commit cadence
- **D-03:** **Every successful run commits `meta.json`** (`lastRunAt`/`lastSuccessAt`/per-source health), even when no items changed, so the LIVE badge stays truthful. That is about 24 deploys/day, within Hobby's 100/day, and it doubles as the 60-day scheduled-workflow keepalive. `items.json` is written only if its stable serialization changed. Note: this deliberately interprets PIPE-02's "only when data changed" as covering meta.json too, because meta.json changes every run.
- **D-04:** Bot commit message format: `chore(data): update feed <ISO-UTC-timestamp> [+N itens]`, conventional-commit style. The workflow commits only `data/**`. `ci.yml` ignores data-only commits through `paths-ignore: data/**`.

### Live page (Phase 1)
- **D-05:** The page is a **status header plus a raw item list**: the hub name, the LIVE/atrasado/parado badge, "última atualização", and a plain list of OpenAI items (title, date, link opening the original). It uses a dark background and PT-BR UI text, with no final design (Phase 4).
- **D-06:** The badge polls **same-origin `/data/meta.json`** about every 60 s (`cache: 'no-store'`, pausing on `visibilitychange`). It does not poll raw.githubusercontent.com. The badge is computed client-side from `lastSuccessAt`: LIVE <90 min, "atrasado" 90–180 min, "parado" >180 min.
- **D-07:** Time display is **relative plus absolute in America/Sao_Paulo**, e.g. "há 12 min · 06/10 14:17 (Brasília)". All stored timestamps are UTC ISO strings.

### Repo, Vercel & deploy fallback
- **D-08:** Repo name **`ai-intelligence-hub`**, public, under the personal account **`thalesguimalopes99`**. The Vercel project has the same name, giving the target URL `ai-intelligence-hub.vercel.app` if it is free. **Never use the Sem Fronteiras account, email or team.** Vercel scope must be the personal account.
- **D-09:** Claude creates the repo and the Vercel project via **`gh` + `vercel` CLI**. The user only approves and logs in if needed. `git push` stays an @devops responsibility, per project rules.
- **D-10:** Data commits are authored and committed as `Thales Guimarães Lopes <215318905+thalesguimalopes99@users.noreply.github.com>`. **Fallback if Hobby refuses those deploys: a Vercel Deploy Hook** (`curl -fsS -X POST "$VERCEL_DEPLOY_HOOK"`, stored as a repo secret) called after the commit. Vercel CLI is not the fallback.
- **D-11:** **"Proven" = 2 consecutive scheduled (not manual) runs** that each produce a commit and a production deploy with the badge/time advancing on the live site. The manual-during-scheduled concurrency test (success criterion 3) must also pass. Only then does Phase 2 start.

### Claude's Discretion
- Exact cron minute (off-minute, e.g. `17 * * * *`), file layout, schema field naming details, and how the "route became dynamic" CI check works.
- The visual details of the skeleton page beyond "dark, PT-BR, plain".

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope & requirements
- `.planning/PROJECT.md` — core value, constraints, verified source table (OpenAI RSS URL)
- `.planning/REQUIREMENTS.md` — PIPE-01..06, DATA-01, DATA-07, DATA-08, FEED-06 definitions
- `.planning/ROADMAP.md` §Phase 1 — goal, 5 success criteria, research flag (empirical Hobby test, 60-day keepalive)

### Research
- `.planning/research/SUMMARY.md` — resolved conflicts (canonical `data/` committed + `prebuild` → gitignored `public/data/`), top risk (Hobby bot commits)
- `.planning/research/STACK.md` — versions (Node 24, Next 16.3, TS ~6.0.3, Tailwind 4.3, zod 4, ky, feedsmith), reference collect workflow
- `.planning/research/ARCHITECTURE.md` — collector → data → build-views → Next app flow
- `.planning/research/PITFALLS.md` — concurrency, date handling, Vercel author check
- `CLAUDE.md` — prescriptive stack, CI and Vercel notes (concurrency group without cancel, git-auto-commit-action v7, setup-node v7)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None. Greenfield repo with only planning docs and AI tooling config (`.claude/`, `.aiox-core/`, etc., kept out of the public repo per the last commit).

### Established Patterns
- Conventional commits (existing history: `docs:`, `chore:`).
- Git identity already set to the owner noreply address.

### Integration Points
- No git remote yet. The GitHub repo and Vercel project are created in this phase.
- `.github/` currently holds only `agents/` (AIOX tooling). The `workflows/` directory is new.

</code_context>

<specifics>
## Specific Ideas

- Badge copy in PT-BR: "LIVE", "atrasado", "parado". Time format: "há 12 min · 06/10 14:17 (Brasília)".
- Commit message example: `chore(data): update feed 2026-10-06T14:17Z [+3 itens]`.

</specifics>

<deferred>
## Deferred Ideas

None. The discussion stayed within phase scope.

</deferred>

---

*Phase: 01-walking-skeleton*
*Context gathered: 2026-10-06*
