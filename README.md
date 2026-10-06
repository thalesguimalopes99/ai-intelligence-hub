# AI Intelligence Hub

Feed público, em PT-BR e com tema escuro, que reúne num só lugar as novidades de Inteligência Artificial publicadas por fontes confiáveis: labs oficiais, pesquisa, newsletters e comunidades. O feed se atualiza sozinho de hora em hora, na nuvem, sem servidor, sem banco de dados e sem API paga. A regra principal é estar sempre atualizado e confiável: uma fonte com erro não derruba a coleta, não há itens duplicados e cada item aponta para o link original.

**Site:** https://ai-intelligence-hub-br.vercel.app

## Como funciona

1. O workflow `collect` do GitHub Actions roda de hora em hora (no minuto 17) e também pode ser disparado manualmente.
2. O coletor busca as fontes, normaliza os itens e grava os arquivos JSON em `data/` (`items.json` e `meta.json`).
3. O workflow faz o commit de `data/` na `main` com a identidade do dono do repositório.
4. A Vercel detecta o commit na `main` e publica o site estático com os dados novos.

Só a branch `main` gera deploy (`vercel.json`). O workflow `ci` roda typecheck, lint, testes, validação dos dados, build e a checagem de rotas estáticas em toda mudança de código. Commits que alteram só `data/` não disparam o CI.

## Comandos locais

Requer Node 24 (veja `.nvmrc`).

```bash
npm ci                 # instala as dependências
npm run dev            # site em http://localhost:3000
npm test               # testes (Vitest)
DATA_DIR=/tmp/aih-data npm run collect   # coleta local numa pasta descartável
```

Ao rodar a coleta na sua máquina, aponte `DATA_DIR` para uma pasta descartável. Assim a execução local nunca mexe em `data/`, que pertence ao workflow.

## Operação

- **`data/` é escrito só pelo workflow `collect`.** Não edite nem faça commit desses arquivos à mão.
- **Workflow agendado desativado:** o GitHub desativa workflows agendados de repositórios públicos depois de 60 dias sem atividade. Os commits de hora em hora devem evitar isso, mas, se acontecer, reative com:

  ```bash
  gh workflow enable collect.yml
  ```

- **Deploy Hook (opcional):** se a Vercel parar de publicar os commits do workflow, crie um Deploy Hook no projeto da Vercel e salve a URL no secret `VERCEL_DEPLOY_HOOK` do repositório. O passo de fallback do workflow `collect` passa a chamar o hook depois de cada commit de dados. Sem o secret, esse passo não faz nada.

## Conteúdo

O site guarda e exibe só metadados, um trecho curto e o link para a publicação original. O conteúdo completo continua na fonte.
