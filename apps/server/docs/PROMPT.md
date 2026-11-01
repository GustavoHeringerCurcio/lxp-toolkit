# Prompt (regras de escrita)

A resposta é gerada por **duas mensagens** montadas em `src/prompt.ts` (`buildMessages`):

1. **`system`** — as regras de escrita, compiladas a partir do `style` estruturado
   (`buildStylePrompt`), mais as instruções extras da atividade, o bloco de **habilidades**
   (`abilities`) e o bloco do **seu projeto** (Meu projeto), quando a atividade ou a disciplina
   estiver com o contexto ligado.
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
- **Anexos com visão (`readAttachments`, padrão ligado):** PDFs e imagens vão também como
  content parts (`file` / `image_url`), para o modelo ver páginas, diagramas, gráficos e
  escaneados. Documentos Office são convertidos em PDF (LibreOffice) antes de anexar. Quando um
  arquivo é anexado, seu texto extraído sai de `{arquivos}` (evita duplicação) e vira uma linha
  "(Arquivo anexado ao modelo: texto e páginas, incluindo diagramas e imagens.)". Limites:
  4 anexos, 10 MB por arquivo, 40 MB no total. Se o modelo recusar arquivos, a chamada é
  repetida só com texto (fallback automático). Base64 nunca é gravado em `ai_run`/debug logs.
- `{questoes}` só é preenchido em questionários.

## Como editar

- **Global:** `apps/server/config/ai-config.json` (`style`, `activitySections`, `abilities` e
  modelos por papel) ou a tela **IA Ajustes**. O runtime grava no Postgres (`ai_config`).
- **Por atividade:** o painel "O que a IA recebe" na tela da atividade (`ai_request` no banco);
  o antigo `config/overrides.json` é lido apenas na importação.
- Os mesmos textos têm cópia em `apps/server/src/config.ts` (`DEFAULT_STYLE`,
  `DEFAULT_ACTIVITY_SECTIONS`) e em `apps/web/src/lib/prompt-preview.ts`. Ao mudar um, mude o
  outro para não divergir.
- **Mantenha o modal "(i) O que a IA vê" atualizado.** A lista do usuário está em
  `apps/web/src/lib/ai-capabilities.ts` (+ chaves `aiInfo.*` em `pt.ts`/`en.ts`). Toda nova
  fonte de entrada, tipo de anexo ou habilidade da IA precisa aparecer lá; o cabeçalho do
  arquivo tem o aviso `KEEP THIS UPDATED`.

## Regras de ouro

- Sem voz de IA, sem despedida, sem oferecer ajuda.
- Responder todas as partes e questões.
- Objetivas: só a letra.
- Não enviar scaffolding: a IA não deve ver (nem devolver) rótulos `=== … ===`.
