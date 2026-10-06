# Phase 1: Walking Skeleton - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-06
**Phase:** 01-walking-skeleton
**Areas discussed:** Conteúdo do coletor, Frequência de commits, O que a página mostra, Repo/Vercel/plano B

---

## Conteúdo do coletor

| Option | Description | Selected |
|--------|-------------|----------|
| 1 fonte real | Ex.: OpenAI RSS com parse/normalização mínimos | ✓ |
| Só heartbeat | Apenas meta.json + items.json vazio | |
| Itens de exemplo fixos | Fixtures estáticos no site público | |

**Fonte:** OpenAI RSS ✓ (alternativas: Hugging Face blog, Claude decide)

| Option | Description | Selected |
|--------|-------------|----------|
| Valores neutros | categories [], score 0, breakdown zerado | ✓ |
| Campos opcionais | Omitidos no JSON | |

## Frequência de commits

| Option | Description | Selected |
|--------|-------------|----------|
| Commit toda hora | meta.json sempre commitado, ~24 deploys/dia | ✓ |
| Só com itens novos | Menos deploys, badge pode mentir | |
| Híbrido | Itens novos ou >60 min desde último commit | |

**Mensagem:** `chore(data): …` ✓

## O que a página mostra

| Option | Description | Selected |
|--------|-------------|----------|
| Status + lista crua | Header, badge, última atualização, lista simples OpenAI | ✓ |
| Só painel de status | Sem itens | |
| Já caprichar no visual | Antecipa Fase 4 | |

**Polling:** `/data/meta.json` do site ✓ (alternativa: raw.githubusercontent.com)
**Horário:** relativo + absoluto em America/Sao_Paulo ✓ (alternativas: só relativo, fuso do navegador)

## Repo, Vercel e plano B

- **Nome:** ai-intelligence-hub ✓ (alternativas: radar-ia, hub-ia)
- **Setup:** Claude via gh + vercel CLI ✓ (alternativa: usuário pelo navegador)
- **Plano B:** Deploy Hook ✓ (alternativas: Vercel CLI no Action, Claude decide)
- **Prova:** 2 runs agendados seguidos ✓ (alternativas: 1 run, 24h estáveis)

## Claude's Discretion

- Minuto exato do cron, layout de arquivos, nomes de campos do schema, mecanismo de detecção de rota dinâmica no CI, detalhes visuais da página esqueleto.

## Deferred Ideas

None.
