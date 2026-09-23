import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, query, runMigrations } from "../src/db.js";
import {
  buildQuizMessages,
  buildSubjectContext,
  isSubjectModule,
  listTrainingSubjects,
  normalizeGeneratedQuestions,
  normalizeInferredAnswers,
  planGeneration,
  selectPortalQuestions,
  type ContextQuestion,
  type SubjectContext,
} from "../src/training.js";

// ── Pure normalization (always run) ─────────────────────────────────────────

const PORTAL: ContextQuestion[] = [
  { id: 101, text: "Quanto é 2+2?", options: ["3", "4", "5"], itemId: 900, itemTitle: "Quiz A" },
  { id: 102, text: "Capital do Brasil?", options: ["SP", "Brasília"], itemId: 900, itemTitle: "Quiz A" },
];

function ctxFixture(): SubjectContext {
  return {
    courseId: 1,
    courseName: "Curso X",
    moduleId: null,
    moduleName: null,
    items: [],
    questions: PORTAL,
    text: "CURSO: Curso X",
  };
}

describe("training · normalização da IA", () => {
  it("normaliza questões geradas (opções string, answerIndex numérico)", () => {
    const raw = {
      title: "T",
      questions: [
        { text: "Q1?", options: ["a", "b", "c", "d"], answerIndex: 2, explanation: "porque" },
        { text: "inválida", options: ["só uma"] },
      ],
    };
    const out = normalizeGeneratedQuestions(raw, 10);
    expect(out).toHaveLength(1);
    expect(out[0].answerIndex).toBe(2);
    expect(out[0].options.map((o) => o.letter)).toEqual(["a", "b", "c", "d"]);
    expect(out[0].explanation).toBe("porque");
  });

  it("aceita alternativas como objetos e resposta em letra", () => {
    const raw = `\`\`\`json
      {"questions":[{"text":"Q?","options":[{"text":"um"},{"text":"dois"}],"answer":"B"}]}
    \`\`\``;
    const out = normalizeGeneratedQuestions(raw, 10);
    expect(out).toHaveLength(1);
    expect(out[0].answerIndex).toBe(1);
    expect(out[0].options[1].text).toBe("dois");
  });

  it("respeita o limite de questões pedido", () => {
    const raw = {
      questions: Array.from({ length: 5 }, (_, i) => ({
        text: `Q${i}`,
        options: ["a", "b"],
        answerIndex: 0,
      })),
    };
    expect(normalizeGeneratedQuestions(raw, 2)).toHaveLength(2);
  });

  it("cruza respostas inferidas com as questões do portal", () => {
    const raw = { answers: [{ id: 101, answerIndex: 1, explanation: "ok" }] };
    const out = normalizeInferredAnswers(raw, PORTAL);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe("Quanto é 2+2?");
    expect(out[0].sourceItemId).toBe(900);
    expect(out[0].sourceKind).toBe("quiz");
  });

  it("seleciona no máximo `count` questões do portal", () => {
    expect(selectPortalQuestions(PORTAL, 1)).toHaveLength(1);
    expect(selectPortalQuestions(PORTAL, 10)).toHaveLength(2);
  });

  it("planeja a mistura portal + IA sem estourar o total", () => {
    expect(planGeneration("mixed", 5, 10)).toEqual({ realCount: 5, aiCount: 5 });
    expect(planGeneration("mixed", 20, 10)).toEqual({ realCount: 10, aiCount: 0 });
    expect(planGeneration("mixed", 0, 10)).toEqual({ realCount: 0, aiCount: 10 });
    expect(planGeneration("ai", 5, 10)).toEqual({ realCount: 0, aiCount: 10 });
  });

  it("monta o prompt misto com as questões e pedido de JSON", () => {
    const messages = buildQuizMessages(ctxFixture(), "mixed", 2, PORTAL);
    const user = messages.find((m) => m.role === "user")?.content ?? "";
    expect(user).toContain("Q101");
    expect(user).toContain("JSON");
  });

  it("considera matéria real quando há professor ou árvore substancial", () => {
    expect(isSubjectModule(1, 0)).toBe(true);
    expect(isSubjectModule(0, 12)).toBe(true);
    expect(isSubjectModule(0, 2)).toBe(false);
  });
});

// ── Postgres integration (gated by LXP_TEST_DB=1) ───────────────────────────

const enabled = process.env.LXP_TEST_DB === "1";
const COURSE = 9_999_991_001;
const MODULE = 9_999_991_002;
const ITEM = 9_999_991_003;
const QUESTION = 9_999_991_004;

describe.skipIf(!enabled)("training (Postgres)", () => {
  beforeAll(async () => {
    await runMigrations();
    await query("INSERT INTO course(id, name) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING", [
      COURSE,
      "Curso de treino",
    ]);
    await query(
      "INSERT INTO module(id, course_id, title, name) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING",
      [MODULE, COURSE, "Módulo de treino", "Módulo de treino"],
    );
    await query(
      `INSERT INTO content_item(id, course_id, module_id, topic_type_id, kind, title, html, raw_json)
       VALUES ($1,$2,$3,15,'quiz','Quiz de treino','<div>Enunciado</div>','{}'::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [ITEM, COURSE, MODULE],
    );
    await query(
      `INSERT INTO content_text(content_item_id, source_kind, text, char_count, status)
       VALUES ($1,'pdf','Texto extraído da apostila sobre bancos relacionais.',50,'ok')
       ON CONFLICT (content_item_id) DO UPDATE SET text = EXCLUDED.text, status = 'ok'`,
      [ITEM],
    );
    await query(
      `INSERT INTO question(id, content_item_id, text, position, text_hash)
       VALUES ($1,$2,'Pergunta de teste?',0,'hash-teste')
       ON CONFLICT (id) DO NOTHING`,
      [QUESTION, ITEM],
    );
    await query(
      `INSERT INTO question_option(id, question_id, position, text)
       VALUES ($1,$2,0,'Opção A'), ($3,$2,1,'Opção B')
       ON CONFLICT (id) DO NOTHING`,
      [9_999_991_005, QUESTION, 9_999_991_006],
    );
  });

  afterAll(async () => {
    await query("DELETE FROM content_item WHERE id = $1", [ITEM]);
    await query("DELETE FROM module WHERE id = $1", [MODULE]);
    await query("DELETE FROM course WHERE id = $1", [COURSE]);
    await closePool();
  });

  it("lista o curso com módulos e contagens", async () => {
    const subjects = await listTrainingSubjects();
    const course = subjects.find((s) => s.courseId === COURSE);
    expect(course).toBeDefined();
    expect(course?.quizCount).toBeGreaterThanOrEqual(1);
    expect(course?.modules.some((m) => m.moduleId === MODULE)).toBe(true);
  });

  it("monta o pacote de contexto com a questão e o material pré-extraído", async () => {
    const ctx = await buildSubjectContext(COURSE, MODULE);
    expect(ctx.courseName).toBe("Curso de treino");
    expect(ctx.questions.some((q) => q.text === "Pergunta de teste?")).toBe(true);
    expect(ctx.text).toContain("Pergunta de teste?");
    expect(ctx.text).toContain("bancos relacionais");
  });
});
