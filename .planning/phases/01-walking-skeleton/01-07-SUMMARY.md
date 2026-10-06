---
phase: 01-walking-skeleton
plan: 07
subsystem: infra
tags: [github-actions, collector, vercel, deploy, live-badge, verification]
requires: ["01-06"]
provides: ["First cloud-collected data (68 OpenAI items) committed by the bot under the owner identity", "Proof that Vercel Hobby accepts the bot-authored data commit (Deploy Hook fallback D-10 not needed)", "Proof that OpenAI RSS is reachable from a GitHub-hosted runner", "Live site with real items and browser-computed LIVE badge, approved by the owner"]
affects: [data/items.json, data/meta.json (bot-written on origin/main only)]
tech-stack:
  added: []
  patterns: ["manual workflow_dispatch as a probe before relying on scheduled runs", "validate bot data from origin/main in a scratch DATA_DIR without pulling into local main"]
key-files:
  created: []
  modified: []
decisions:
  - "Deploy Hook fallback (D-10) is not needed: Hobby deployed the bot commit authored/committed as the owner noreply identity"
  - "Local main is deliberately not reconciled with origin/main; the bot data commit e024a9b stays only on origin until the next push by @devops (git pull --rebase origin main)"
metrics:
  duration: ~1 session
  completed: 2026-10-06
  tasks: 2
  files: 0
requirements: [PIPE-02, FEED-06, DATA-07]
---

# Phase 1 Plan 07: Runner probe and live loop verification Summary

A manual dispatch of collect.yml from a real GitHub runner fetched the OpenAI RSS feed (68 new items), committed data as the owner identity, and Vercel Hobby deployed that bot commit to production. The live site lists real OpenAI items with a browser-computed LIVE badge, and the owner approved it. No code changes were needed.

## Tasks

| Task | Name | Commit | Notes |
|------|------|--------|-------|
| 1 | Manual dispatch probe + identity/deploy/CI-skip/live checks | e024a9b (bot commit on origin/main; no local commit) | All acceptance criteria met |
| 2 | Owner verifies live site in browser | none (human-verify) | Approved by the owner on 2026-10-06 |

## Task 1 evidence

- Run 37471789859 (`workflow_dispatch`, 2026-10-06T13:33:46Z, head d21bf1f): **success**. Log line `[collect] run_status=ok items_new=68`. No blocked/403/503/Cloudflare challenge. Assumption A3 (OpenAI reachable from runner IPs) confirmed.
- meta.json: openai-news status ok, errorKind null, itemsFetched 1247, itemsNew 68.
- Bot commit e024a9beea7c4aca13e42c19fe61c27c575abf8b: subject `chore(data): update feed 2026-10-06T13:34Z [+68 itens]`. Author AND committer are `Thales Guimarães Lopes <215318905+thalesguimalopes99@users.noreply.github.com>` (T-01-24 mitigated). It touches only data/items.json (+73) and data/meta.json (+33).
- `npm run validate:data` on a scratch copy of origin/main data (mktemp + DATA_DIR) exited 0: "items.json: 68 items OK", "meta.json: OK (lastRunStatus=ok, sources=1)" (T-01-25 mitigated).
- Vercel: commit status `Vercel | success | Deployment has completed` (https://vercel.com/thalesguimalopes99s-projects/ai-intelligence-hub-br/C1s7JeccuvimU2GKsUkQBii5Si14). `vercel ls --prod` shows Ready, Production, https://ai-intelligence-hub-1f0pxjse0-thalesguimalopes99s-projects.vercel.app, build 22 s. Assumption A1 (Hobby accepts owner-noreply bot commits) confirmed.
- ci.yml: 0 runs for e024a9b (only d21bf1f), so data-only commits skip CI.
- Live /data/meta.json lastSuccessAt 2026-10-06T13:34:18.471Z equals origin/main; lastRunStatus ok.
- Live HTML (X-Vercel-Cache PRERENDER): 50 openai.com links with `target="_blank" rel="noopener noreferrer"`, heading "Últimas da OpenAI", server badge "verificando", line "Última atualização: 06/10 10:34 (Brasília)".

## Task 2 record

The owner approved on 2026-10-06 (replied "bora") after the checklist: dark PT-BR page, up to 50 items opening in a new tab, badge VERIFICANDO to LIVE, relative time advancing, meta.json polled about every 60 s, no hydration warnings. No issues reported.

## Deviations from Plan

None - plan executed exactly as written. Local main was intentionally not pulled or merged (plan step 3), so e024a9b exists only on origin/main.

## Auth gates

None.

## Requirements

- PIPE-02, DATA-07, FEED-06: satisfied by this plan's evidence.
- PIPE-03 remains In Progress: a bot-authored commit produced a READY production deploy (this plan), but the scheduled (not manual) run proof belongs to plan 01-08.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

- FOUND: bot commit e024a9b on origin/main (verified via git log origin/main in Task 1)
- FOUND: workflow run 37471789859 success; Vercel production deployment Ready
- No local files created by the task other than this SUMMARY
