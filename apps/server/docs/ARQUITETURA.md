# Arquitetura

## Visão geral

```
                 (packages/portal)                    (apps/server + apps/web)
 portal ──dump──► scraped/courses/**, scraped/raw/** ──index──► Postgres (fonte da verdade)
                                                                 │  migrate + import
                                                                 ├─► project ─► data/exercises.json (cache da UI)
                                                                 │
                                                   OpenAI ◄──── ai.ts ◄── prompt.ts
                                                                 │
                                                                 ▼
                                                    store.ts ──► answer_attempt / ai_run
                                                                 │
                        packages/portal/scripts/submit-task.ts ◄── send.ts
                                     (Playwright)               │
                                        │                        ▼
                                        └── portal ◄──── store.ts ──► submission
```

## Camadas

### packages/portal (leitura e escrita no portal)

- `src/session.ts` — `createSession()` faz login fresco no Lyceum e devolve
  `{ browser, context, page, client, auth }`.
- `src/auth.ts` / `src/client.ts` — login e cliente autenticado da API LXP.
- `scripts/dump-content.ts` (`npm run dump`) — raspa o conteúdo do curso para `scraped/`.
- `scripts/submit-task.ts` — runner de envio. Recebe `--req <json>` e `--result <json>` e
  navega via `$nuxt.$router.push`. Ações: `upload` (texto digitado, `.txt` ou `.pdf` anexado),
  `quiz` (marca as alternativas; `survey: true` para pesquisas) e `forum` (publica o post via
  endpoint por matrícula, com fallback pelo compositor da SPA).

### apps/server + apps/web (produto)

- `src/db.ts` + `db/migrations/` — Postgres (fonte da verdade): pool, transações e
  migrações versionadas (`schema_migrations`). O banco é **obrigatório** (sem fallback JSON);
  suba com `docker compose up -d db` e aplique com `npm run db:migrate`.
- `src/import.ts` — importa `scraped/raw/content-tree.json` (incluindo tópicos ocultos,
  `origin: "hidden"`) para o Postgres (idempotente) e faz **reconciliação** do estado legado
  (`answers.json`, `submissions.json`, `overrides.json`, `ai-config.json`) por chave natural
  (sem duplicar em re-execuções).
- `src/store.ts` — **camada de escrita/leitura em runtime**: respostas, overrides, envios,
  perfil, config de IA, anotações e `ai_run` vão direto para o Postgres. É a única fonte de
  verdade da atividade do aluno.
- `src/professor.ts` — resolve o sufixo do título do módulo ("… - Profa. Débora Amorim") para o
  `safeaUserId` estável de `context.teachers[]` e grava `module_professor` (fonte, confiança).
- `src/organizations.ts` — cruza o diretório commitado (`config/organizations.json`) com os
  professores locais para resolver fotos; a imagem é carregada no navegador, não no servidor.
- `src/project-context.ts` — detecta o projeto principal da disciplina e a relevância por
  atividade (modelo barato, cacheado em `project_profile` / `activity_project`).
- `src/project.ts` — projeta a view `v_exercise_current` para `data/exercises.json` (cache da UI)
  e calcula o `catalogVersion` que invalida o cache.
- `src/load.ts` — orquestra `migrate → import → project` (`npm run index:web`).
- `src/view.ts` — enriquece cada atividade com resposta salva, override, foto de professor e as
  instruções extras de IA.
- `src/prompt.ts` — compila as mensagens `system` (regras estruturadas + habilidades + projeto) e
  `user` (conteúdo da atividade) enviadas ao modelo.
- `src/ai.ts` — chama a OpenAI (streaming) e devolve texto + proveniência (modelo, tokens,
  prompt) para gravar em `ai_run`.
- `src/classify.ts` / `src/build.ts` — detecção de "flavor" e revisão preguiçosa por IA das
  tarefas ambíguas.
- `src/gate.ts` — quality gate do rascunho antes do envio.
- `src/training.ts` / `src/training-store.ts` — modo treino: monta o pacote de conhecimento a
  partir do Postgres e persiste sessões/questões/respostas.
- `src/diagram.ts` / `src/diagram-tool.ts` — geração de diagramas.
- `src/config.ts` — **legado**: só lê os JSON antigos para a importação e serve os testes.
- `src/send.ts` — grava o request JSON, dá `spawn` no `submit-task.ts` do pacote do
  portal, acompanha o resultado e persiste o envio em `submission`. É a única ponte entre o
  app e a escrita no portal.
- `server/server.ts` — API HTTP (exercícios, respostas, geração com streaming, treino, envio,
  preview de arquivos, god's eye) e serve o build do web na porta 4174.
- `../web/` — interface React (painel, atividade, treino, ajustes, god's eye).

## Dados

Postgres é a **fonte da verdade** (local, por usuário, `DATABASE_URL` gitignored). Domínios:

- **Identidade/tenant** — `institution`, `student`, `enrollment`.
- **Catálogo acadêmico** — `course`, `module`, `professor`, `module_professor`, `section`,
  `content_item` (com `raw_json` para proveniência), `attachment`.
- **Banco de questões** — `question`, `question_option` (com `text_hash` para reuso entre períodos).
- **Atividade do aluno** — `item_state` (snapshot append-only a cada scrape), `answer_attempt`
  (tentativas imutáveis; a atual é a `is_current`), `answer_selection`, `submission`,
  `submission_payload`, `item_annotation`.
- **IA** — `ai_config`, `ai_run`.
- **Treino** — `training_quiz`, `training_question`, `training_answer`.
- **Visibilidade (God's Eye)** — `content_item` ganha `origin`/`gradebook_id`/`is_visible`/
  `is_future` (migração `0014`); itens ocultos ficam fora das listas normais e aparecem em
  `/gods-eye`.
- **Leitura** — view `v_exercise_current` (alimenta a projeção `/api/exercises`).

Os JSON antigos **não são mais escritos** pelo app — servem apenas para a importação única:

- `data/exercises.json` — projeção gerada a partir de `v_exercise_current` (cache da UI).
- `config/ai-config.json`, `config/profile.json`, `config/overrides.json`,
  `data/answers.json`, `data/submissions.json` — legado; a verdade está no banco.

## Envio (write side)

O token do LXP é de uso único e a AWS WAF protege os POST/PUT, então toda escrita passa
por um navegador real:

1. `src/send.ts` escreve `data/send/req-<id>-<ts>.json` e chama
   `tsx packages/portal/scripts/submit-task.ts --req … --result …`.
2. O runner faz login fresco, navega até a atividade, anexa o arquivo (upload) ou marca
   as alternativas (quiz) e clica em enviar.
3. O resultado vira `data/send/res-<id>-<ts>.json` e é persistido em `submission` (Postgres).

### Upload

A tarefa de envio de arquivo do LXP é um compositor de resposta (TinyMCE + anexo) com os
botões "Save draft" e "Send reply", e o texto do botão pode aparecer em inglês. O runner:

- aceita os botões em português e inglês e prioriza envio sobre rascunho;
- preenche o editor com o texto da resposta e anexa um arquivo `.txt` (o uploader só
  aceita `jpg/png/gif/txt/pdf/doc/docx/xls/xlsx/ppt/pptx/rar/zip/7z` — `.md` é recusado);
- nomeia o anexo como `<nome do perfil>_<título da atividade>.txt` (o `filename` vai no
  request; o runner sanitiza e cai no antigo `lxp-submit-<ts>-<itemId>` se não houver);
- clica em "Send reply" e confirma o modal "Submission confirmation" (outro "Send reply").

O envio é considerado ok quando o portal registra a tentativa (campo `attempts` do
tópico) com o anexo. Use `--dry-run` para validar os seletores sem enviar nada.

Cada tentativa vira uma linha em `submission` (status `running`/`ok`/
`already`/`unknown`/`failed`, detalhe, anexo e horário). Quando o resultado é `ok` ou
`already`, o servidor grava `manual_status = 'done'` em `item_annotation`, e o
`enrich` passa a mostrá-la como concluída. A web usa o sonner para avisar o resultado.

### Quiz

Para questionários a IA gera no formato `Q<id>: <letra>`. O servidor extrai as
alternativas (`parseQuizSelections` em `src/prompt.ts`) e guarda em `answer_selection`
(ligado à `answer_attempt`). No envio, `launchQuizSubmit` manda `action: "quiz"` com as
seleções (id, índice, letra, texto da questão e da alternativa) e o runner marca cada
alternativa e clica em enviar.

O endpoint/DOM de envio de quiz nunca foi capturado (ver `../../packages/portal/docs/gaps.md` §1). Os
seletores em `packages/portal/scripts/submit-task.ts` (`clickQuizOption`) são heurísticos; para deixar
100% confiável:

```bash
# na raiz, sessão supervisionada
npm run capture-api -- --url https://unifoa2.grupoa.education/plataforma/course/<curso>/content/<quiz> --headful
# responder um quiz de verdade e encerrar para dump das chamadas
```
