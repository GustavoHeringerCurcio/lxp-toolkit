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
                                                         data/answers.json ──► answer_attempt
                                                                 │
                        packages/portal/scripts/submit-task.ts ◄── send.ts
                                     (Playwright)               │
                                        │                        ▼
                                        └── portal ◄──── data/submissions.json ──► submission
```

## Camadas

### packages/portal (leitura e escrita no portal)

- `src/session.ts` — `createSession()` faz login fresco no Lyceum e devolve
  `{ browser, context, page, client, auth }`.
- `src/auth.ts` / `src/client.ts` — login e cliente autenticado da API LXP.
- `scripts/dump-content.ts` (`npm run dump`) — raspa o conteúdo do curso para `scraped/`.
- `scripts/submit-task.ts` — runner de envio. Recebe `--req <json>` e `--result <json>`.
  Hoje só trata `action: "upload"`: navega via `$nuxt.$router.push`, anexa o arquivo
  montado a partir do texto, clica em enviar e detecta o sucesso.

### apps/server + apps/web (produto)

- `src/db.ts` + `db/migrations/` — Postgres (fonte da verdade): pool, transações e
  migrações versionadas (`schema_migrations`). O banco é **obrigatório** (sem fallback JSON);
  suba com `docker compose up -d db` e aplique com `npm run db:migrate`.
- `src/import.ts` — importa `scraped/raw/content-tree.json` para o Postgres (idempotente) e faz
  backfill do estado legado (`answers.json`, `submissions.json`, `overrides.json`, `ai-config.json`).
- `src/professor.ts` — resolve o sufixo do título do módulo ("… - Profa. Débora Amorim") para o
  `safeaUserId` estável de `context.teachers[]` e grava `module_professor` (fonte, confiança).
- `src/project.ts` — projeta a view `v_exercise_current` para `data/exercises.json` (cache da UI).
- `src/load.ts` — orquestra `migrate → import → project` (`npm run index`).
- `src/view.ts` — enriquece cada atividade com resposta salva, override e as instruções
  extras de IA.
- `src/prompt.ts` — compila as mensagens `system` (regras estruturadas) e `user`
  (conteúdo da atividade) enviadas ao modelo.
- `src/ai.ts` — chama a OpenAI (`chat.completions`, streaming) e devolve o texto.
- `src/config.ts` — lê/grava config, respostas (com histórico), overrides e envios.
- `src/send.ts` — grava o request JSON, dá `spawn` no `submit-task.ts` do pacote do
  portal e acompanha o resultado. É a única ponte entre o app e a escrita no portal.
- `server/server.ts` — API HTTP (exercícios, respostas, geração com streaming, envio,
  preview de arquivos) e serve o build do web na porta 4174.
- `../web/` — interface React (painel, atividade, ajustes).

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
- **Leitura** — view `v_exercise_current` (alimenta a projeção `/api/exercises`).

Os arquivos JSON continuam existindo como **cache/legado** e são regravados pelo index:

- `config/ai-config.json`, `config/profile.json`, `config/overrides.json` — espelhados no banco.
- `data/exercises.json` — projeção gerada a partir de `v_exercise_current` (cache da UI).
- `data/answers.json`, `data/submissions.json` — legado; o banco guarda as tentativas/envios.

## Envio (write side)

O token do LXP é de uso único e a AWS WAF protege os POST/PUT, então toda escrita passa
por um navegador real:

1. `src/send.ts` escreve `data/send/req-<id>-<ts>.json` e chama
   `tsx packages/portal/scripts/submit-task.ts --req … --result …`.
2. O runner faz login fresco, navega até a atividade, anexa o arquivo (upload) ou marca
   as alternativas (quiz) e clica em enviar.
3. O resultado vira `data/send/res-<id>-<ts>.json` e é registrado em
   `data/submissions.json`.

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

Cada tentativa vira uma entrada em `data/submissions.json` (status `running`/`ok`/
`already`/`unknown`/`failed`, detalhe, anexo e horário). Quando o resultado é `ok` ou
`already`, o servidor grava `manualStatus: "done"` no override da atividade, e o
`enrich` passa a mostrá-la como concluída. A web usa o sonner para avisar o resultado.

### Quiz

Para questionários a IA gera no formato `Q<id>: <letra>`. O servidor extrai as
alternativas (`parseQuizSelections` em `src/prompt.ts`) e guarda em `data/answers.json`
(campo `selections`). No envio, `launchQuizSubmit` manda `action: "quiz"` com as
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
