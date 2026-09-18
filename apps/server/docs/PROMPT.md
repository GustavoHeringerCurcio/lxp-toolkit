# Prompt (regras de escrita)

A resposta é gerada por **duas mensagens** montadas em `src/prompt.ts` (`buildMessages`):

1. **`system`** — as regras de escrita, compiladas a partir do `style` estruturado
   (`buildStylePrompt`), mais as instruções extras da atividade, o bloco de **habilidades**
   (`abilities`) e o bloco de **projeto** da disciplina, quando houver.
2. **`user`** — o conteúdo da atividade (`buildActivityPrompt`), com os placeholders preenchidos.

Não existe um esqueleto editável cheio de marcadores `=== … ===`. O conteúdo é montado pelo
código com rótulos simples, e as regras de sistema dizem explicitamente para a IA **não repetir
esses rótulos** — por isso o modelo não devolve mais o scaffolding.

## Regras de estilo (config `style`)

As regras são estruturadas, editadas por cards em **IA Ajustes**:

| Campo              | Tipo                          | Efeito                                            |
| ------------------ | ----------------------------- | ------------------------------------------------- |
| `persona`          | texto                         | quem a IA está sendo                              |
| `voice`            | texto                         | tom/idioma                                        |
| `includeIdentity`  | bool                          | começar com `Nome:` / `Matrícula:`                |
| `mcqMode`          | `letter` \| `letter_text`     | objetivas: só a letra ou letra + justificativa    |
| `numbering`        | bool                          | numerar cada resposta                             |
| `associateInline`  | bool                          | associação na mesma linha (`1. item - resposta`)  |
| `noIntroOutro`     | bool                          | sem introdução/despedida                          |
| `noMetaLabels`     | bool                          | não repetir rótulos de contexto                   |
| `extraRules`       | texto (uma regra por linha)   | regras livres adicionais                          |

`buildStylePrompt` compila isso em algo assim:

```
Você é o aluno entregando esta atividade.
Escreva em português simples e natural, como um estudante de faculdade — não como um assistente.

Formato da resposta:
- Comece a resposta com duas linhas: "Nome: {nome}" e "Matrícula: {matricula}".
- Numere cada resposta com o número da questão, na ordem em que aparecem.
- Questões de múltipla escolha: escreva só a letra da alternativa (exemplo: 2. A).
- Questões de associação: escreva cada item com a resposta na mesma linha (exemplo: 1. item - resposta).

Regras:
- Nunca diga que é uma IA e nunca use linguagem de assistente.
- Não repita os rótulos de contexto da atividade (Atividade, Tipo, Módulo, Enunciado, Arquivos, Questões, Observações).
- Sem introdução, sem despedida e sem oferecer ajuda extra.
- Escreva em texto simples, sem símbolos, emojis ou negrito.
```

## Conteúdo da atividade (config `activitySections`)

Os toggles `enunciado`, `arquivos`, `questoes` e `observacoes` decidem o que entra na mensagem
`user`, sempre com `Atividade`, `Tipo` e `Módulo` no topo:

```
Atividade: {atividade}
Tipo: {tipo}
Módulo: {modulo}

Enunciado:
{enunciado}

Arquivos anexados:
{arquivos}

Questões:
{questoes}

Observações do aluno:
{observacoes}
```

## Placeholders disponíveis

`{nome}`, `{matricula}`, `{atividade}`, `{tipo}`, `{modulo}`, `{prazo}`, `{enunciado}`,
`{arquivos}`, `{questoes}`, `{observacoes}`.

- `{arquivos}` recebe o texto extraído do PDF/anexo (até 30.000 caracteres).
- `{questoes}` só é preenchido em questionários.

## Como editar

- **Global:** `apps/server/config/ai-config.json` (`style`, `activitySections`, `abilities` e
  modelos por papel) ou a tela **IA Ajustes**. O runtime grava no Postgres (`ai_config`).
- **Por atividade:** o painel "O que a IA recebe" na tela da atividade (`ai_request` no banco);
  o antigo `config/overrides.json` é lido apenas na importação.
- Os mesmos textos têm cópia em `apps/server/src/config.ts` (`DEFAULT_STYLE`,
  `DEFAULT_ACTIVITY_SECTIONS`) e em `apps/web/src/lib/prompt-preview.ts`. Ao mudar um, mude o
  outro para não divergir.

## Regras de ouro

- Sem voz de IA, sem despedida, sem oferecer ajuda.
- Responder todas as partes e questões.
- Objetivas: só a letra.
- Não enviar scaffolding: a IA não deve ver (nem devolver) rótulos `=== … ===`.
