---
phase: 1
slug: walking-skeleton
status: draft
shadcn_initialized: false
preset: none
created: 2026-10-06
---

# Fase 1 — Contrato de Design de UI

> Contrato visual e de interação para fases de frontend. Gerado pelo gsd-ui-researcher, verificado pelo gsd-ui-checker.

**Escopo (de 01-CONTEXT.md D-05..D-07 e REQUIREMENTS FEED-06):** uma única página estática `/` com um cabeçalho de status (nome do hub, selo LIVE/atrasado/parado e "última atualização") e uma lista simples de itens da OpenAI (título, data e link para o original). É um walking skeleton: a experiência de leitura final fica para a Fase 4. Mesmo assim, esta fase **estabelece** os tokens de design (cor, tipografia, espaçamento, raio e foco) que a Fase 4 e as seguintes reaproveitam e estendem. A Fase 4 pode adicionar tokens, mas não pode renomear nem mudar o papel dos tokens abaixo.

**Fontes das decisões:** CONTEXT = `01-CONTEXT.md`; CLAUDE = stack travado em `CLAUDE.md`; REQ = `REQUIREMENTS.md`; FEAT = `research/FEATURES.md`; padrão = escolha do pesquisador dentro de "Claude's Discretion: detalhes visuais da página skeleton".

---

## Sistema de Design

| Propriedade | Valor | Fonte |
|-------------|-------|-------|
| Ferramenta | nenhuma. Tokens CSS-first do Tailwind CSS 4.3 via `@theme` em `src/app/globals.css`, sem `tailwind.config.*` | CLAUDE |
| Preset | não se aplica | — |
| Biblioteca de componentes | nenhuma, só componentes escritos à mão. O shadcn **não** faz parte do stack travado. Adotá-lo ou não é decidido de novo no UI-phase da Fase 4. | CLAUDE / padrão |
| Biblioteca de ícones | `lucide-react`. Nesta fase usa só `ExternalLink` e `AlertTriangle`. | CLAUDE |
| Fonte | Geist Sans via `next/font/google` (`Geist`), variável `--font-sans`, com fallback `ui-sans-serif, system-ui, sans-serif`. Horários usam `font-variant-numeric: tabular-nums` (classe `tabular-nums`). Sem fonte mono nesta fase. | padrão (fonte do scaffold do create-next-app) |
| Tema | Só escuro: sem alternância de tema e sem ramificação por `prefers-color-scheme`. `<html lang="pt-BR">` com `color-scheme: dark`. | CLAUDE / REQ UI-01, UI-02 |
| Imagens | Nenhuma. O único gráfico é um glifo SVG inline ao lado do nome do hub. Sem imagens geradas por IA e sem thumbnails hotlinkadas. | CLAUDE |

### Declaração de tokens (bloco `@theme` exato para `globals.css`)

```css
@import "tailwindcss";

@theme {
  --color-bg: #0B0D12;          /* dominante: fundo da página */
  --color-surface: #141821;     /* secundária: painel de status */
  --color-border: #232836;      /* linhas finas, borda do painel, divisores da lista */
  --color-fg: #E6E9EF;          /* texto principal */
  --color-fg-muted: #9AA3B2;    /* metadados, horários, rodapé */
  --color-accent: #5EEAD4;      /* ver "Accent reservado para" */
  --color-live: #4ADE80;        /* status: LIVE */
  --color-warn: #FBBF24;        /* status: atrasado */
  --color-danger: #F87171;      /* status: parado + aviso de erro */

  --font-sans: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;

  --radius-panel: 12px;
  --radius-pill: 9999px;
}
```

O espaçamento usa a escala padrão do Tailwind, com base de 4px (`p-1` = 4px, `p-2` = 8px, `p-4` = 16px, ...). Só valem as classes que correspondem à escala abaixo.

---

## Escala de Espaçamento

Valores declarados (todos múltiplos de 4):

| Token | Valor | Tailwind | Uso nesta fase |
|-------|-------|----------|----------------|
| xs | 4px | `1` | Padding vertical do selo; espaço entre o ponto de status e o rótulo do selo; espaço entre o título e o ícone `ExternalLink` |
| sm | 8px | `2` | Padding horizontal do selo; espaço entre o título do item e a data; espaço entre o selo e a linha "Última atualização" quando empilhados |
| md | 16px | `4` | Padding horizontal da página no mobile (<640px); padding do painel de status; padding vertical de cada linha de item |
| lg | 24px | `6` | Padding horizontal da página a partir de 640px; espaço entre o cabeçalho e o painel de status |
| xl | 32px | `8` | Espaço entre o painel de status e a seção da lista; padding superior da página |
| 2xl | 48px | `12` | Espaço entre a lista e o rodapé; padding inferior da página |
| 3xl | 64px | `16` | Não usado nesta fase (reservado) |

Constantes de layout:
- Coluna de conteúdo com `max-width: 720px`, centralizada (`mx-auto`) e em coluna única em todos os breakpoints (mobile-first).
- A fase usa um único breakpoint, `sm` (640px), e só para duas coisas: o padding horizontal da página passa de 16px para 24px, e o selo e a linha de atualização ficam na mesma linha.

Exceções:
- **Alvos de toque:** cada link de item tem área clicável de pelo menos 44px de altura. A linha inteira é o link, e 16px de padding vertical com 24px de altura de linha do título dão pelo menos 56px (FEAT: 44px recomendado; WCAG 2.5.8).
- **Ponto de status:** círculo de 8px x 8px (`size-2`). É um gráfico, não um espaçamento, e mesmo assim cai na escala.
- **Bordas:** linhas de 1px são permitidas e não contam como token de espaçamento.

---

## Tipografia

São exatamente 4 tamanhos e 2 pesos.

| Papel | Tamanho | Peso | Altura de linha | Uso |
|-------|---------|------|-----------------|-----|
| Body | 16px (`text-base`) | 400 | 1.5 (24px) | Títulos dos itens, tagline, corpo do estado vazio |
| Label | 14px (`text-sm`) | 400 nos metadados, 600 no selo | 1.4 (~20px) | Rótulo do selo (600, caixa alta via CSS, `tracking-wide`), linha "Última atualização", datas dos itens, rodapé, aviso de erro de polling |
| Heading | 20px (`text-xl`) | 600 | 1.2 (24px) | Título da seção "Últimas da OpenAI" e título do estado vazio |
| Display | 28px (`text-[28px]`) | 600 | 1.2 (~34px) | Nome do hub "AI Intelligence Hub" (o único `<h1>` da página) |

Pesos: só **400 (regular)** e **600 (semibold)**.

Regras:
- Os títulos dos itens usam 16px/400 em `--color-fg`, sem negrito. A lista deve ler como um fluxo calmo, e a hierarquia chega na Fase 4.
- Todos os horários (linha do selo e datas dos itens) usam `tabular-nums`, para que o tempo relativo não mude de largura ao atualizar.
- Os títulos dos itens levam `lang="en"`, porque o conteúdo das notícias fica no idioma original (REQ UI-01). O resto da página herda `lang="pt-BR"`.
- Títulos longos quebram linha. Nesta fase não há truncamento nem reticências.

---

## Cor

| Papel | Valor | Uso |
|-------|-------|-----|
| Dominante (60%) | `#0B0D12` (`bg`) | Fundo da página e da lista de itens |
| Secundária (30%) | `#141821` (`surface`) + `#232836` (`border`) | Painel de status (selo + "Última atualização") com borda e cantos arredondados; divisores da lista |
| Accent (10%) | `#5EEAD4` (`accent`) | Só os elementos listados abaixo |
| Destrutiva | `#F87171` (`danger`) | Não há ações destrutivas nesta fase. Usada só no status "parado" e no ícone do aviso de erro de polling |

Cores de status (semânticas). Não são o accent e só aparecem dentro do selo de status:

| Estado | Cor | Fundo do selo | Texto do selo | Ponto |
|--------|-----|---------------|---------------|-------|
| LIVE | `#4ADE80` (`live`) | `live` com 12% de opacidade (`bg-live/12`) | `live` | Sólido em `live`, pulsando (ver Interação) |
| atrasado | `#FBBF24` (`warn`) | `warn` com 12% | `warn` | Sólido em `warn`, estático |
| parado | `#F87171` (`danger`) | `danger` com 12% | `danger` | Sólido em `danger`, estático |
| verificando (antes da hidratação) | `#9AA3B2` (`fg-muted`) | `fg-muted` com 12% | `fg-muted` | Anel vazado em `fg-muted`, estático |

Accent reservado para:
1. O anel de foco do teclado em todo elemento focável: `outline: 2px solid var(--color-accent); outline-offset: 2px`, exibido só em `:focus-visible`.
2. O estado de hover/foco do link do título do item: sublinhado (`decoration-accent`, 1px, `underline-offset-4`) e o ícone `ExternalLink` ao final passando para `accent`. O texto do título continua em `fg`.
3. O glifo SVG inline ao lado do nome do hub.

O accent **não** é usado em texto corrido, fundos, selo de status nem no título da seção.

Contraste (WCAG 2.2 AA, linha de base de REQ UI-04, medido sobre `bg #0B0D12`):
- `fg` #E6E9EF: cerca de 16:1, quando o mínimo para texto é 4.5:1. PASSA.
- `fg-muted` #9AA3B2: cerca de 7.6:1 sobre `bg` e 6.9:1 sobre `surface`. PASSA. Este é o ponto de falha comum em temas escuros (FEAT), então não escureça esta cor.
- `live`, `warn` e `danger` sobre o próprio fundo com 12% em cima de `surface`: cada um com pelo menos 7:1. PASSA.
- Anel de foco `accent` sobre `bg`: cerca de 12:1, quando o mínimo para elementos não textuais é 3:1. PASSA.
- O status nunca depende só da cor. Cada estado tem um rótulo de texto próprio e uma frase explicativa em `title`/sr-only.

---

## Anatomia da Página (de cima para baixo)

1. **Cabeçalho** (`<header>`): glifo SVG inline (20px, `accent`) + `<h1>` "AI Intelligence Hub" (Display). Abaixo, a tagline (Body, `fg-muted`).
2. **Painel de status** (`<section aria-label="Status da atualização">`, `surface`, borda de 1px em `border`, `radius-panel`, padding de 16px):
   - Selo em pílula (`radius-pill`, padding de 4px x 8px, com ponto de 8px, espaço de 4px e o rótulo).
   - Linha "Última atualização" (Label, `fg-muted`, `tabular-nums`).
   - Aviso opcional de erro de polling (Label, `fg-muted`, com `AlertTriangle` de 16px em `danger`). Só aparece depois de um polling que falhou.
   - Disposição: no mobile, empilhado (selo em cima, linha embaixo, espaço de 8px). A partir de 640px fica na mesma linha, alinhado ao centro, com espaço de 16px e quebra permitida.
3. **Lista de itens** (`<section aria-labelledby>`): `<h2>` "Últimas da OpenAI" (Heading), seguido de um `<ol>` em ordem cronológica reversa. As linhas são separadas por divisores de 1px em `border`, sem cards.
   - Cada linha é um único `<a>` que cobre a linha inteira (`href` = URL original, `target="_blank"`, `rel="noopener noreferrer"`) e contém:
     - Título (Body, `fg`, `lang="en"`) + ícone `ExternalLink` (16px, `fg-muted`, `aria-hidden`), com espaço de 4px.
     - Data (Label, `fg-muted`, `<time dateTime={ISO}>`), 8px abaixo do título.
     - Sufixo sr-only: "(abre a fonte original em nova aba)".
4. **Rodapé** (`<footer>`, Label, `fg-muted`): texto explicativo (ver Copywriting).

---

## Contrato de Interação

### Selo LIVE (FEED-06, CONTEXT D-06)
- **Estratégia de renderização:** a página é totalmente estática (SSG), e o HTML gerado no build não sabe a hora atual. Por isso o servidor renderiza o selo no estado **"verificando"** e mostra o horário absoluto do último sucesso (conhecido no build), sem a parte relativa. Uma ilha de cliente (`"use client"`) hidrata, calcula o estado na hora a partir do `lastSuccessAt` embutido no build e então passa a fazer polling.
- **Polling:** `fetch('/data/meta.json', { cache: 'no-store' })` a cada 60 s. Pausa quando `document.visibilityState === 'hidden'` e busca imediatamente ao voltar para `visible`. Não usa nenhuma outra fonte de dados.
- **Limites** (calculados no navegador a partir de `lastSuccessAt`, contra `Date.now()`): LIVE `< 90 min`; atrasado de 90 a 180 min (90 e 180 inclusive); parado `> 180 min` ou quando `lastSuccessAt` não existe.
- **Recalculo:** o tempo relativo e o estado do selo são recalculados a cada polling **e** num tick local de 30 s, para que o tempo avance mesmo quando um polling falha.
- **Falha de polling** (erro de rede, status fora de 2xx ou JSON inválido): mantém o último `lastSuccessAt` conhecido, de modo que o estado continua se degradando naturalmente com o tempo, e mostra o aviso de erro. O aviso some no próximo polling bem-sucedido. Não há rajada de tentativas: a próxima espera o ciclo normal de 60 s.
- **Sem recarregar a página e sem layout shift.** O selo reserva uma largura mínima fixa (`min-w-[96px]`), então trocar o rótulo não desloca a linha de atualização.

### Movimento
- Ponto do LIVE: pulso de opacidade (1 → 0.4 → 1) de 2 s, ease-in-out, infinito. **Desligado** com `prefers-reduced-motion: reduce`, quando o ponto fica sólido.
- Troca de estado do selo: só uma transição de cor de 150 ms (`transition-colors`), também desligada com movimento reduzido.
- Nenhuma outra animação nesta fase.

### Acessibilidade
- O rótulo do selo fica dentro de uma região `aria-live="polite"` que anuncia **só mudanças de estado** (por exemplo "atrasado"). O tempo relativo fica fora da região live, para não ser anunciado a cada 30 s.
- Cada selo tem `title` e uma explicação sr-only (ver Copywriting).
- Anel de foco visível em todos os links (accent, ver Cor). Nunca usar `outline: none` sem substituto.
- Um único `<h1>`, um único `<h2>` para a lista, e os landmarks `<header>`/`<main>`/`<footer>`.

### Formatação de data e hora (CONTEXT D-07)
- Os valores armazenados são strings ISO em UTC. A exibição é em `America/Sao_Paulo`, com `TZDate` do `@date-fns/tz` e o locale `ptBR` do `date-fns`.
- **Linha de status:** `Última atualização: há {relativo} · {dd/MM HH:mm} (Brasília)`. Exemplo: "Última atualização: há 12 min · 06/10 14:17 (Brasília)".
  - Forma relativa: abaixo de 1 min, "agora mesmo"; abaixo de 60 min, "há N min"; abaixo de 24 h, "há N h"; acima disso, "há N dias". Calcular com `differenceInMinutes`/`differenceInHours`, não com `formatDistance`, cuja saída em ptBR ("cerca de 1 hora") é vaga demais aqui.
  - Antes da hidratação: `Última atualização: {dd/MM HH:mm} (Brasília)` (só o absoluto).
- **Datas dos itens** (renderizadas no build, então sempre absolutas, nunca relativas):
  - `datePrecision` = datetime: `dd/MM/yyyy · HH:mm` (por exemplo "06/10/2026 · 14:17").
  - `datePrecision` = day: `dd/MM/yyyy`, sem hora e sem deslocamento de fuso.
  - Sem data confiável: "Data não informada" (nunca exibir como "agora").

---

## Contrato de Copywriting

Todo texto de interface é em PT-BR. Os rótulos do selo são exatos e vêm das especificidades do CONTEXT.

| Elemento | Texto |
|----------|-------|
| `<title>` da página | AI Intelligence Hub — novidades de IA a cada hora |
| Meta description | Novidades de Inteligência Artificial de fontes oficiais, atualizadas automaticamente a cada hora. |
| H1 | AI Intelligence Hub |
| Tagline | Novidades de IA de fontes confiáveis, atualizadas sozinhas a cada hora. |
| Título da seção (H2) | Últimas da OpenAI |
| CTA principal | O link do título do item, que abre a fonte original em nova aba. Sufixo acessível: "(abre a fonte original em nova aba)". Não há botão de CTA nesta fase. |
| Selo — LIVE | Rótulo `LIVE` · title/sr-only: "Ao vivo: a última coleta terminou há menos de 90 minutos." |
| Selo — atrasado | Rótulo `atrasado` (caixa alta via CSS) · title/sr-only: "Atrasado: a última coleta concluída foi entre 90 minutos e 3 horas atrás." |
| Selo — parado | Rótulo `parado` (caixa alta via CSS) · title/sr-only: "Parado: nenhuma coleta concluída nas últimas 3 horas." |
| Selo — verificando | Rótulo `verificando` · title/sr-only: "Verificando o status da atualização." |
| Linha de status | Última atualização: há {relativo} · {dd/MM HH:mm} (Brasília) |
| Linha de status — nunca houve sucesso | Última atualização: ainda nenhuma coleta concluída. (selo = parado) |
| Título do estado vazio | Nenhuma notícia por aqui ainda |
| Corpo do estado vazio | A coleta automática ainda não trouxe itens da OpenAI. O feed se atualiza sozinho a cada hora — volte daqui a pouco. |
| Estado de erro (polling falhou) | Não foi possível verificar a atualização agora. Tentaremos de novo em 1 minuto. |
| Item sem data | Data não informada |
| Rodapé | Atualizado automaticamente a cada hora. Nesta versão inicial, a única fonte é o blog oficial da OpenAI (RSS); mais fontes chegam em breve. Cada item leva direto ao texto original. |
| Confirmação destrutiva | Não se aplica: esta fase não tem ações destrutivas. |

---

## Segurança de Registry

| Registry | Blocos usados | Gate de segurança |
|----------|---------------|-------------------|
| shadcn oficial | nenhum (shadcn não inicializado) | não se aplica |
| terceiros | nenhum | não se aplica |

---

## Fora do Escopo (fica para a Fase 4 em diante)

Cards, chips de fonte e empresa, categorias, chip de relevância, filtros, busca, Destaques, pílula "N novidades", "Carregar mais", agrupamento por dia (Fase 2), compartilhar/copiar, skeletons de carregamento e a identidade de marca final. Como a lista é estática, esta fase não tem estado de carregamento. A Fase 4 constrói em cima dos tokens acima.

---

## Aprovação do Checker

- [ ] Dimensão 1 Copywriting: PASSA
- [ ] Dimensão 2 Visual: PASSA
- [ ] Dimensão 3 Cor: PASSA
- [ ] Dimensão 4 Tipografia: PASSA
- [ ] Dimensão 5 Espaçamento: PASSA
- [ ] Dimensão 6 Segurança de Registry: PASSA

**Aprovação:** pendente
