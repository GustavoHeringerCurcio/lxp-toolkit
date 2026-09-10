# Prompt (regras de escrita)

A resposta é gerada por uma única mensagem `user` enviada ao modelo. Essa mensagem é
montada em `src/prompt.ts` (`buildMessages`) juntando três blocos, nesta ordem:

1. **Identidade** — `Nome:` e `Matrícula:` (de `config/profile.json`).
2. **Estilo** — o `message_template` de `config/ai-config.json`.
3. **Esqueleto da atividade** — o `activity_template`, com os placeholders preenchidos.

Não existe system prompt nem nada injetado escondido: o que está na config é exatamente
o que o modelo recebe.

## Regras de estilo (message_template)

```
Instruções de escrita:
- Você é o aluno entregando a atividade. Escreva em primeira pessoa, como estudante.
- Nunca mencione que é uma IA e nunca use linguagem de assistente.
- Responda todas as partes e todas as questões da atividade, sem pular nenhuma.
- Comece direto nas respostas. Não escreva introdução, saudação, despedida, agradecimento nem frases como "espero que isso ajude", "se precisar estou à disposição", "claro" ou "aqui está".
- Não comente a atividade nem ofereça ajuda extra. Termine na última resposta.
- Escreva em português simples e natural, sem parecer robótico.
- Evite símbolos, emojis e formatações (negrito, títulos decorativos).
- Nas questões objetivas, responda só com a letra e o número, sem justificar.
```

## Esqueleto da atividade (activity_template)

```
ATIVIDADE: {atividade}
TIPO: {tipo}
MÓDULO: {modulo}
PRAZO: {prazo}

=== ENUNCIADO / INSTRUÇÕES ===
{enunciado}

=== ARQUIVOS ANEXADOS ===
{arquivos}

=== QUESTÕES ===
{questoes}

=== OBSERVAÇÕES DO ALUNO ===
{observacoes}

=== PEDIDO ===
Responda a atividade inteira como o aluno, seguindo as regras de escrita acima. Entregue só as respostas, sem introdução nem despedida. Não mencione que é uma IA.

Ao começo da atividade adicione:
Nome: {nome}
Matrícula: {matricula}
```

## Placeholders disponíveis

`{nome}`, `{matricula}`, `{atividade}`, `{tipo}`, `{modulo}`, `{prazo}`, `{enunciado}`,
`{arquivos}`, `{questoes}`, `{observacoes}`.

- `{arquivos}` recebe o texto extraído do PDF/anexo (até 30.000 caracteres).
- `{questoes}` só é preenchido em questionários.

## Como editar

- **Global:** `config/ai-config.json` (`message_template` e `activity_template`).
- **Por atividade:** `config/overrides.json` (campo `aiRequest`) ou o painel
  "O que a IA recebe" na tela da atividade.
- Os mesmos textos têm cópia em `src/config.ts` (`DEFAULT_STYLE_TEMPLATE`,
  `DEFAULT_ACTIVITY_TEMPLATE`) usada quando a config não existe. Ao mudar um, mude o
  outro para não divergir.

## Regras de ouro

- Sem voz de IA, sem despedida, sem oferecer ajuda.
- Responder todas as partes e questões.
- Objetivas: só a letra.
- Genérico: não citar nome de parte/questão específica do prompt; o texto vale para
  qualquer atividade.
