# LXP Toolkit

Copiloto de estudos pessoal e local para o portal **UniFOA / Grupoa LXP**.

## Objetivo

Entrar com a conta do próprio aluno no portal, ler as atividades abertas (tarefas de envio de
arquivo e questionários), organizar prazos, gerar rascunhos em português com cara de aluno e
enviar de volta ao portal com o mínimo de cliques possível — sempre com revisão e confirmação
explícitas.

Não é um "assistente" nem um chat: é uma ferramenta de organização e entrega de atividades. O
texto gerado é um **rascunho** — você decide o que envia.

## Fluxo ponta a ponta

```
1. RASPAGEM   (portal)   npm run dump      portal -> scraped/courses/**, scraped/raw/**
2. ÍNDICE     (server)   npm run index:web scraped/ -> Postgres (migrate + import + project)
                                                       └─► data/exercises.json (cache da UI)
3. GERAÇÃO    (server)   botão "Gerar"     exercícios + conteúdo -> OpenAI -> answer_attempt (Postgres)
4. ENVIO      (server)   botão "Enviar"    spawn packages/portal/scripts/submit-task.ts
5. PORTAL     (portal)   submit-task.ts    login fresco -> SPA -> anexa/seleciona -> envia
```

- Leitura: só os passos 1 e 5 falam com o portal. O app lê do Postgres já populado.
- Escrita: sempre por navegador real (Playwright), porque o token é de uso único e a AWS WAF
  protege os POST/PUT.
- Cada geração guarda uma versão imutável em `answer_attempt`; cada envio vira uma linha em
  `submission`. **Postgres é a fonte da verdade.**

## O que é automático e o que tem trava

| Etapa | Situação |
|---|---|
| Raspar conteúdo | automático (`npm run dump`) |
| Indexar no Postgres | automático (`npm run index:web`) |
| Gerar rascunho | automático (streaming) |
| Enviar upload | funciona (runner `submit-task.ts`, ação `upload`; texto / `.txt` / `.pdf`) |
| Enviar quiz | implementado (ação `quiz`); seletores validados ao vivo |
| Publicar em fórum | implementado (ação `forum`, com fallback pelo compositor da SPA) |

O envio mostra o resultado em **toast** (sucesso, "já estava entregue", sem confirmação ou erro
com o motivo). Quando o portal confirma, a atividade é marcada como feita (badge verde "Feito"),
de forma persistente. Reenvios de algo já entregue são detectados e avisados.

## Mapa de arquivos

| Caminho | Papel |
|---|---|
| `src/db.ts` + `db/migrations/` | Postgres: pool, transações e migrações versionadas. |
| `src/import.ts` | Importa `scraped/raw/content-tree.json` e reconcilia o estado legado (JSON) por chave natural. |
| `src/store.ts` | Camada de escrita/leitura em runtime: respostas, overrides, envios, perfil, config de IA e `ai_run`. |
| `src/load.ts` | Orquestra `migrate → import → project` (`npm run index:web`). |
| `src/project.ts` | Projeta `v_exercise_current` para `data/exercises.json` (cache da UI) e calcula o `catalogVersion`. |
| `src/view.ts` | Enriquece cada atividade (resposta salva, override, foto de professor, instruções extras). |
| `src/professor.ts` | Resolve o professor do módulo para o `safeaUserId` estável. |
| `src/project-context.ts` | Detecta o projeto da disciplina e a relevância por atividade (cacheado). |
| `src/prompt.ts` | Monta as mensagens `system` + `user` enviadas ao modelo. |
| `src/ai.ts` | Chamada à OpenAI (streaming) + proveniência gravada em `ai_run`. |
| `src/classify.ts` / `src/build.ts` | Detecção de "flavor" e revisão preguiçosa por IA. |
| `src/gate.ts` | Quality gate: analisa o rascunho antes do envio. |
| `src/training.ts` / `training-store.ts` | Modo treino: gera questões a partir do material e persiste sessões. |
| `src/diagram.ts` / `diagram-tool.ts` | Geração de diagramas. |
| `src/send.ts` | Dispara o runner de envio no pacote do portal e persiste o resultado. |
| `src/config.ts` | **Legado**: só lê os JSON antigos para a importação e serve os testes. |
| `server/server.ts` | API HTTP + serve o app web (porta 4174). |
| `../web/` | Interface React. |
| `config/ai-config.json` | Modelos, temperatura, estilo, habilidades (editável). |
| `config/organizations.json` | Diretório de organizações/professores (commitado). |

## Comandos

Na **raiz do repositório**:

```bash
npm install
cp apps/server/.env.example apps/server/.env   # OPENAI_API_KEY (opcional) + DATABASE_URL
npm run db:up                                  # sobe o Postgres (Docker)
npm run db:migrate                             # aplica as migrações
npm run dump                                   # raspa o portal (packages/portal)
npm run index:web                              # migrate → import → project
npm run web                                    # build + servidor -> http://localhost:4174
npm run typecheck
```

## Documentos

- [ARQUITETURA.md](./ARQUITETURA.md) — como as peças se conectam.
- [PROMPT.md](./PROMPT.md) — regras de escrita enviadas ao modelo.
