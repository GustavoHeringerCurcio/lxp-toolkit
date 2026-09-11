# LXP Homework

Fazedor de dever de casa pessoal e local para o portal **UniFOA / Grupoa LXP**.

## Objetivo

Entrar com a conta do próprio aluno no portal, ler as atividades abertas (tarefas de
envio de arquivo e questionários), gerar a resposta inteira em português com cara de
aluno e enviar de volta ao portal com o mínimo de cliques possível.

Não é um "assistente" nem um chat: é uma ferramenta de entrega de atividades. O texto
gerado não deve parecer escrito por IA.

## Fluxo ponta a ponta

```
1. RASPAGEM   (raiz)       npm run dump          portal -> scraped/courses/**, scraped/raw/**
2. ÍNDICE     (assistant)  npm run index         scraped/ -> assistant/data/exercises.json
3. GERAÇÃO    (assistant)  botão "Gerar"         exercises + PDF -> OpenAI -> data/answers.json
4. ENVIO      (assistant)  botão "Enviar"        spawn scripts/submit-task.ts (Playwright)
5. PORTAL     (raiz)       submit-task.ts        login fresco -> SPA -> anexa/seleciona -> envia
```

- Leitura: só o passo 1 e 5 falam com o portal. O app lê do `scraped/` já raspado.
- Escrita: sempre por navegador real (Playwright), porque o token é de uso único e a
  AWS WAF protege os POST/PUT.
- Cada geração guarda uma versão em `data/answers.json` (histórico). Envio registra em
  `data/submissions.json`.

## O que é automático e o que tem trava

| Etapa | Situação |
|---|---|
| Raspar conteúdo | automático (`npm run dump`) |
| Gerar resposta | automático |
| Enviar upload | funciona (runner `scripts/submit-task.ts`, ação `upload`, arquivo `.txt`) |
| Enviar quiz | implementado (ação `quiz`); os seletores do portal ainda precisam ser validados ao vivo |

O envio mostra o resultado em **toast** (sucesso, "já estava entregue", sem confirmação
ou erro com o motivo). Cada tentativa fica salva em `data/submissions.json` e aparece na
seção "Envios" da atividade. Quando o portal confirma, a atividade é marcada como feita
(botão verde "Feito" + badge), inclusive de forma persistente (`manualStatus` nos
overrides). Reenvios de algo já entregue são detectados e avisados, sem dump cru.

## Mapa de arquivos

| Caminho | Papel |
|---|---|
| `src/config.ts` | config de IA + respostas + overrides + envios |
| `src/prompt.ts` | monta a única mensagem enviada ao modelo |
| `src/ai.ts` | chamada à OpenAI (streaming) |
| `src/build.ts` / `src/load.ts` | `scraped/` -> `data/exercises.json` |
| `src/view.ts` | visão enriquecida de cada atividade |
| `src/send.ts` | dispara o runner de envio no repositório raiz |
| `src/export.ts` | exporta resposta para `out/` |
| `server/server.ts` | API HTTP + serve o app web (porta 4174) |
| `web/` | interface React |
| `cli/main.ts` | CLI (`npm run assistant -- …`) |
| `config/ai-config.json` | modelo, temperatura, prompt (editável) |
| `config/profile.json` | nome e matrícula do aluno |
| `config/overrides.json` | ajustes por atividade |
| `data/answers.json` | respostas geradas + histórico |
| `data/submissions.json` | histórico de envios |

## Comandos

```bash
# dentro de assistant/
npm install
cp .env.example .env      # coloque OPENAI_API_KEY
npm run index             # monta data/exercises.json a partir do scraped/ raspado
npm run web               # build + servidor -> http://localhost:4174
npm run assistant -- list # CLI
npm run typecheck
```

Na raiz, antes: `npm run dump` (raspa o portal).

## Documentos

- [PROMPT.md](./PROMPT.md) — regras de escrita enviadas ao modelo.
- [ARQUITETURA.md](./ARQUITETURA.md) — como as peças se conectam.
