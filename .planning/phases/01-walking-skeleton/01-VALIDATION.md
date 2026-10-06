---
phase: 1
slug: walking-skeleton
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-06
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `01-RESEARCH.md` → `## Validation Architecture`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.3 (`environment: 'node'`, `resolve.tsconfigPaths: true`) |
| **Config file** | none — Wave 0 creates `vitest.config.ts` |
| **Quick run command** | `npx vitest run --reporter=dot` |
| **Full suite command** | `npm run typecheck && npm run lint && npm test && npm run validate:data && npm run build && npm run check:static` |
| **Estimated runtime** | ~5 s (quick) / ~90 s (full, includes `next build`) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=dot` + `npm run typecheck`
- **After every plan wave:** Run the full suite command
- **Before `/gsd:verify-work`:** Full suite green **and** D-11 evidence (2 consecutive scheduled runs → owner-authored commits → production deploys → live time advanced) **and** the concurrency test
- **Max feedback latency:** 10 seconds (quick run)

---

## Per-Task Verification Map

Requirement-level map (task IDs are filled in by the planner in each PLAN.md `<verify>` block).

| Requirement | Behavior | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|------------|-----------------|-----------|-------------------|-------------|--------|
| DATA-01 | Schema accepts normalized item; rejects `javascript:` URL, offset timestamp, score 101, missing cluster | XSS via feed URL | `z.httpUrl()` only http/https | unit | `npx vitest run tests/schema.test.ts` | ❌ W0 | ⬜ pending |
| DATA-01 | OpenAI fixture → valid items; id = 16-hex sha256 of canonical URL, stable | — | N/A | unit | `npx vitest run tests/normalize-openai.test.ts` | ❌ W0 | ⬜ pending |
| DATA-07 | Meta: lastSuccessAt advances only on success; consecutiveFailures increments; errorKind set | — | N/A | unit | `npx vitest run tests/meta.test.ts` | ❌ W0 | ⬜ pending |
| DATA-08 | Serializer deterministic, one item per line, sorted; round-trip | — | N/A | unit | `npx vitest run tests/serialize.test.ts` | ❌ W0 | ⬜ pending |
| DATA-08 / PIPE-02 | Invalid data → nothing written, non-zero exit; unchanged items untouched; tmp+rename | Corrupted JSON deployed | validate-then-atomic-write | unit | `npx vitest run tests/store.test.ts` | ❌ W0 | ⬜ pending |
| DATA-08 | build-views `data/` → `public/data/meta.json`; missing data → empty-state meta | — | N/A | unit | `npx vitest run tests/build-views.test.ts` | ❌ W0 | ⬜ pending |
| PIPE-04 | merge idempotent, keeps firstSeenAt, 30-day window | — | N/A | unit | `npx vitest run tests/merge.test.ts` | ❌ W0 | ⬜ pending |
| FEED-06 | `liveStatus` boundaries 0/89.9/90/180/180.1 min, null, invalid, future; relative/absolute formats | — | N/A | unit | `npx vitest run tests/live-status.test.ts` | ❌ W0 | ⬜ pending |
| PIPE-06 | No dynamic routes | — | N/A | build check | `npm run build && npm run check:static` | ❌ W0 | ⬜ pending |
| PIPE-06 | Lint/typecheck pass | — | N/A | static | `npm run lint && npm run typecheck` | scaffold | ⬜ pending |
| PIPE-01 | cron `17 * * * *` + workflow_dispatch, concurrency no-cancel, `ref: main`, least-privilege permissions | Workflow script injection | feed strings via `env:`, never `${{ }}` in `run:` | static (YAML assertion) | `npx vitest run tests/workflows.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — node env, `resolve.tsconfigPaths: true`, include `tests/**/*.test.ts`
- [ ] `tests/fixtures/feeds/openai.xml` — trimmed real snapshot (~15 items, ≥1 older than 30 days); tests never hit live URLs
- [ ] `tests/schema.test.ts`, `normalize-openai.test.ts`, `meta.test.ts`, `serialize.test.ts`, `store.test.ts`, `merge.test.ts`, `build-views.test.ts`, `live-status.test.ts`, `workflows.test.ts`
- [ ] `scripts/check-static.ts`, `scripts/validate-data.ts`
- [ ] Framework install (vitest 5.0.3 + stack per RESEARCH Installation block)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Scheduled run commits as owner and Vercel deploys production | PIPE-01/02/03 | Live infra (GitHub cron + Vercel Hobby author check) | `gh run list -w collect.yml -e schedule -L 3 --json conclusion,headSha,createdAt`; `git log -3 --format='%an <%ae> / %cn <%ce> %s' origin/main`; check commit status / `vercel ls --prod` |
| Live page time advances; badge polls without reload | FEED-06 | Needs deployed site + browser | `curl -s https://<domain>/data/meta.json` vs repo `data/meta.json`; DevTools: no hydration warnings, poll every ~60 s |
| Manual run during scheduled run → two clean sequential commits | PIPE-04 | Needs real concurrent runs | dispatch while a scheduled run is in progress; `git pull && npm run validate:data && git log --oneline -3 -- data/` |
| Repo public & personal; only main deploys | PIPE-05 | Account/config state | `gh repo view thalesguimalopes99/ai-intelligence-hub --json visibility,owner`; `vercel.json` present |
| Data-only commit skips CI | PIPE-06 | Needs real push | `gh run list -w ci.yml --json headSha` excludes the bot data commit SHA |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
