# Topic types — Grupoa LXP

Authoritative mapping fetched live from
`GET /v1/plataforma/settings/institution/configuration/topic-types`
(raw captured at `docs/raw/topic-types.json`).

`topicTypeId` is the discriminator on every content-tree node and item. `category_type_id`
groups them into coarse buckets (see table).

## Full mapping

| topicTypeId | Name (pt-BR) | alias | cat | Scraper `kind` |
|---|---|---|---|---|
| 1 | Grupo de módulos | folder | 1 | (module) |
| 2 | Módulo | page | 1 | (section) |
| 3 | Conteúdo | html | 2 | reading / pdf |
| 4 | Link | link | 3 | link |
| 5 | Arquivo | file | 3 | other |
| 6 | Ferramenta externa (LTI) | lti | 9 | other |
| 7 | Links | link_group | 4 | link |
| 8 | Tarefa | task | 5 | file_upload |
| 9 | Fórum | forum | 6 | forum |
| 10 | Apresentação | presentation | 2 | other |
| 11 | Desafio | challenge | 5 | other |
| 12 | Infográfico | infographic | 2 | other |
| 13 | Sumário teórico | book | 2 | other |
| 14 | Dica do professor | teacher_tip | 2 | other |
| 15 | Questionário | quiz | 8 | **quiz** |
| 16 | Na prática | practice | 2 | other |
| 17 | 3D | 3d | 2 | other |
| 18 | Laboratório virtual | virtual_labs | 2 | other |
| 19 | Webconferência | web_conference_meet | 7 | other |
| 20 | Webconferência Teams | web_conference_teams | 7 | other |
| 21 | Unidade de aprendizagem | learning_unit | 1 | (section) |
| 22 | Vídeo | video | 2 | other |
| 23 | Interativo | embedded_link | 3 | other |
| 24 | Vídeo 360º | 360 | 2 | other |
| 25 | Experimento | experiment | 2 | other |
| 26 | Roteiro | script | 2 | other |
| 27 | Avaliação | avalia_activity | 10 | other |
| 28 | H5P | h5p | 11 | other |
| 29 | Pré-teste | pre_test | 8 | **quiz** |
| 30 | Pós-teste | test | 8 | **quiz** |
| 31 | Scorm | scorm | 12 | other |
| 32 | Resumo | resume | 2 | other |
| 34 | Jogo | game | 2 | other |
| 35 | Ficha | file | 2 | other |
| 36 | Para pensar | to_think | 2 | other |
| 37 | Exercícios | exercise | 8 | **quiz** |
| 38 | Videoaula | videoaula | 2 | other |
| 39 | Estudo de Caso | case_study | 5 | other |
| 40 | Entrevista | interview | 2 | other |
| 41 | Vídeo interativo | interactive_video | 2 | other |
| 42 | Indicação de leitura | reading_indication | 4 | other |
| 43 | Outro | other | 2 | other |
| 44 | Conteúdo imersivo | immersive_content | 2 | other |
| 45 | Simulador | sim | 2 | other |
| 46 | Objeto interativo | interactive-object | 2 | other |
| 48 | Resumo da UA | audiobook | 2 | other |
| 49 | Saiba mais | know_more | 4 | other |
| 50 | Laboratório | lab | 2 | other |
| 51 | Atividade | activity | 5 | other |
| 52 | Conteúdo HTML | html | 2 | other |
| 53 | Conteúdo do livro | book_alg | 2 | other |
| 120 | Simulador | simulator_edtech | 2 | other |
| 153 | Português | TESTE | 4 | other |
| 154 | teste | Projeto_Marketing | 4 | other |
| 187 | Pagamento | pagamento | 2 | other |
| 220 | MARKETING · Revisão textual | Projeto_MKT_RTX | 2 | other |

## `category_type_id` buckets

| cat | Meaning |
|---|---|
| 1 | containers (module / section / learning unit) |
| 2 | content (rich media: presentation, video, infographic, book, …) |
| 3 | links |
| 4 | link groups / reading indications |
| 5 | assignments (task / challenge / case study / activity) |
| 6 | forum |
| 7 | web conference |
| 8 | quizzes/assessments (quiz, exercise, pre/post test) |
| 9 | LTI tool |
| 10–12 | avalia / h5p / scorm |

## Quiz types (category 8)

All of these carry a `content.questions[]` payload and are answerable:

- `15` Questionário
- `29` Pré-teste
- `30` Pós-teste
- `37` Exercícios ← 4 quizzes in this student's course
- `15` Questionário ← 4 more quizzes in this student's course (8 total)

## Assignment / upload types (category 5)

All of these carry `content.hasFileUpload` + `content.maxFilesLimit`:

- `8` Tarefa ← the 35 file-upload items in this course
- `11` Desafio
- `39` Estudo de Caso
- `51` Atividade

## Present in this course (measured)

| topicTypeId | count | scraper `kind` |
|---|---|---|
| 3 | 74 | reading/pdf |
| 7 | 7 | link |
| 8 | 35 | file_upload |
| 9 | 3 | forum |
| 10 | 3 | other |
| 11 | 2 | other |
| 12 | 4 | other |
| 13 | 3 | other |
| 15 | 4 | **quiz** |
| 16 | 3 | other |
| 22 | 2 | other |
| 37 | 4 | **quiz** |
| 49 | 1 | other |

> Note: `src/content.ts::classify` maps 37→quiz but currently **misses 15/29/30** (also quizzes).
> See docs/gaps.md.
