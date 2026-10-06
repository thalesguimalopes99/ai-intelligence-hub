# AI Intelligence Hub

## What This Is

Site público, responsivo e mobile-first (dark mode) que centraliza novidades de Inteligência Artificial vindas de fontes confiáveis — labs oficiais, pesquisa, newsletters e comunidades — num feed cronológico com filtros, destaques e ranking por relevância. Atualiza sozinho de hora em hora na nuvem (GitHub Actions → JSON → deploy Vercel), sem servidor, sem banco, sem API paga e sem depender do computador do dono. Para qualquer pessoa que acompanha IA (público aberto, interface em PT-BR) — e para o próprio dono usar como primeira aba do dia, fonte de pautas de conteúdo e base para decidir ferramentas.

## Core Value

O feed tem que estar **sempre atualizado e confiável sozinho**: coleta horária que nunca cai por causa de uma fonte com erro, sem duplicatas, e com o link certo para a fonte original. Se todo o resto falhar, isso precisa funcionar.

## Requirements

### Validated

(None yet — ship to validate)

### Active

**Coleta (collector)**
- [ ] Coleta automática de hora em hora via GitHub Actions (cron + disparo manual), sem computador ligado
- [ ] Adapters por tipo de fonte: RSS/Atom, JSON (HF Daily Papers, arXiv API), HTML scraping (Anthropic, Meta AI)
- [ ] Isolamento de falhas: timeout + retry por fonte, `Promise.allSettled`; fonte com erro mantém seus itens anteriores e não derruba o processo; o run só falha se todas as fontes falharem ou o JSON for inválido
- [ ] Status de saúde por fonte (ok / erro / última coleta bem-sucedida) gravado em `meta.json` e exibido no site
- [ ] Normalização para um schema único (id, título, url canônica, fonte, empresa, data, trecho, categorias, score)
- [ ] Deduplicação: URL canônica (sem utm/trailing slash/www) com hash + similaridade de título entre fontes (agrupa e lista fontes que cobriram)
- [ ] Classificação por regras (keywords/regex) nas 13 categorias: Models, Agents, Coding, API, Automation, Prompt Engineering, Research, Image, Video, Audio, Business, Safety, Hardware — multi-label com categoria primária
- [ ] Relevance score 0–100 por regras: peso da fonte, boosts (lançamento, nome de modelo, API, open-source), cobertura multi-fonte, decaimento por idade, penalidades (vagas, eventos, cases de cliente)
- [ ] Armazenamento JSON: `items.json` (janela de 30 dias), `archive/AAAA-MM.json` (histórico mensal), `meta.json` (lastUpdated + status)
- [ ] Controle de volume do arXiv (filtro por score/cap diário; HF Daily Papers como sinal curado principal)

**Site**
- [ ] Feed cronológico com card: título, fonte, empresa, data, categorias, score, botão para abrir a fonte original
- [ ] Filtros por empresa, categoria e período, refletidos na URL (compartilháveis)
- [ ] Seção de Destaques = lançamentos grandes (modelo/API/produto novo dos grandes labs) por score nas últimas 48h
- [ ] Indicador LIVE (última coleta < 90 min; senão "atrasado") e "última atualização"; página relê `meta.json` periodicamente sem reload
- [ ] Página de histórico (navegar arquivos mensais)
- [ ] Página de status das fontes (transparência das limitações)
- [ ] Top da semana (10 assuntos de maior score nos últimos 7 dias)
- [ ] "Em alta" (assuntos cobertos por várias fontes ao mesmo tempo)
- [ ] Botão copiar/compartilhar (título + link + fonte, pronto para colar)
- [ ] Interface em PT-BR; conteúdo das notícias no idioma original
- [ ] Layout moderno, dark mode, mobile-first, distinto (não template genérico)

**Deploy & docs**
- [ ] Deploy na Vercel conectado ao repo GitHub (cada commit de dados dispara deploy)
- [ ] Repo público no GitHub
- [ ] `docs/SOURCES.md` documentando cada fonte, método de integração, URL verificada e limitações

### Out of Scope

- Chatbot / assistente conversacional — explicitamente não desejado
- APIs pagas (de IA ou de dados) — restrição de custo zero
- Tradução automática das manchetes — adiada para v2 (avaliar opção gratuita, ex.: modelo open-source rodando no Action)
- The Batch (DeepLearning.AI) na v1 — sem RSS (404 em `/the-batch/feed/` e `/feed/`) e página renderizada no cliente; documentar limitação, avaliar Playwright headless em v2
- Banco de dados / backend próprio — JSON no repo basta na v1
- Contas de usuário, login, personalização salva no servidor — site público estático
- Reprodução do conteúdo completo dos artigos — só título, trecho curto e link (direitos autorais)
- Domínio próprio na v1 — usar `*.vercel.app` inicialmente

## Context

**Fontes verificadas por HTTP em 2026-10-06** (não inventar URLs; reverificar de dentro do GitHub Actions):

| Fonte | Método | URL | Status |
|---|---|---|---|
| OpenAI | RSS | https://openai.com/news/rss.xml | 200 |
| Anthropic | HTML scraping (sem RSS: 404 em /rss.xml e /news/rss.xml) | https://www.anthropic.com/news + https://www.anthropic.com/sitemap.xml (262 URLs /news/ com lastmod) | 200 |
| Anthropic (complemento) | Atom releases | https://github.com/anthropics/anthropic-sdk-python/releases.atom | 200 |
| Google DeepMind | RSS | https://deepmind.google/blog/rss.xml | 200 |
| Google AI / Gemini | RSS | https://blog.google/technology/ai/rss/ | 200 |
| Google Research | RSS | https://research.google/blog/rss/ | 200 |
| Microsoft AI | RSS (blogs.microsoft.com/ai/feed/ = 410 Gone) | https://news.microsoft.com/source/topics/ai/feed/ | 200 |
| Microsoft Research | RSS | https://www.microsoft.com/en-us/research/feed/ | 200 |
| Microsoft Foundry | RSS | https://devblogs.microsoft.com/foundry/feed/ | 200 |
| Meta AI | HTML scraping (sem RSS: 404 em /blog/rss/ e sitemap) | https://ai.meta.com/blog/ (links no HTML do servidor) | 200 |
| Meta (complemento) | RSS | https://engineering.fb.com/feed/, https://about.fb.com/news/feed/ (filtrar IA) | 200 |
| Hugging Face | RSS | https://huggingface.co/blog/feed.xml | 200 |
| HF Daily Papers | JSON API | https://huggingface.co/api/daily_papers | 200 |
| GitHub | RSS | https://github.blog/feed/, https://github.blog/changelog/feed/ (filtrar IA/Copilot) | 200 |
| GitHub Releases | Atom | https://github.com/openai/openai-python/releases.atom (padrão `/{owner}/{repo}/releases.atom`) | 200 |
| arXiv | RSS + API | https://rss.arxiv.org/rss/cs.AI (~400 itens/dia), http://export.arxiv.org/api/query | 200 |
| TLDR AI | RSS | https://tldr.tech/api/rss/ai | 200 |
| Latent Space | RSS (Substack) | https://www.latent.space/feed | 200 |
| Reddit | RSS sem auth | https://www.reddit.com/r/{sub}/.rss — r/MachineLearning e r/LocalLLaMA = 200; r/artificial = 429; `.json` = 403 | instável |
| The Batch | — | sem feed | fora da v1 |

Subreddits escolhidos: r/OpenAI, r/ClaudeAI, r/MachineLearning, r/LocalLLaMA (peso baixo, opcionais, fail-soft — Reddit costuma bloquear IPs de datacenter como os runners do GitHub; RSS do Reddit não traz upvotes).

**Plataforma:**
- Cron do GitHub Actions é best-effort (atraso de 5–30 min é comum).
- Workflows agendados são desativados após 60 dias sem atividade no repo — commits horários do bot mantêm ativo.
- Vercel Hobby: grátis, mas uso não-comercial; cron nativo do Hobby só 1x/dia (por isso a coleta fica no Actions); ~24 deploys/dia cabe no limite.

**Usuário:** dono hoje praticamente não acompanha IA de forma estruturada ("quase nada") — o hub é a primeira rotina. Usos: criar conteúdo (pautas), decidir ferramentas, ficar atualizado, pesquisa técnica.

## Constraints

- **Custo**: zero — sem APIs pagas, sem servidor pago — requisito explícito
- **Tech stack**: Next.js + TypeScript + Tailwind CSS; collector em Node/TS no mesmo repo — preferência do usuário
- **Infra**: GitHub (repo público) + GitHub Actions (coleta) + Vercel (hosting) — nuvem, sem máquina local
- **Storage**: arquivos JSON versionados no repo — sem banco na v1
- **Integridade de fontes**: nunca inventar URL de feed; toda fonte verificada por requisição real; limitação documentada quando não houver integração simples
- **Resiliência**: uma fonte com erro não pode derrubar o processo
- **Conteúdo**: só metadados + trecho curto + link (direitos autorais)
- **Visual**: sem imagem gerada por IA — design em código/SVG/CSS

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Coleta no GitHub Actions, dados em JSON commitados | Grátis, roda na nuvem, histórico versionado no git | — Pending |
| Hosting na Vercel (não GitHub Pages) | Escolha do usuário; deploy automático a cada commit | — Pending |
| Repo público | Actions com minutos ilimitados; transparência | — Pending |
| Interface PT-BR, notícias no idioma original | Público brasileiro; tradução sem API paga adiada p/ v2 | — Pending |
| Score e classificação 100% por regras | Sem IA paga; explicável e ajustável | — Pending |
| Anthropic e Meta via scraping HTML | Não possuem RSS oficial (verificado) | ⚠️ Revisit (frágil a mudanças de layout) |
| The Batch fora da v1 | Sem feed e página client-side | — Pending |
| Reddit como fonte opcional de peso baixo | RSS público funciona, mas bloqueio de IP de datacenter é provável | — Pending |
| Destaques = lançamentos grandes por score | Definição do usuário | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-10-06 after initialization*
