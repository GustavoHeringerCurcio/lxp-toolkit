import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, query, runMigrations } from "../src/db.js";
import {
  classifyByDate,
  filterItemsForExam,
  keywordExamOrder,
  majorityExamId,
  resolveCourseExams,
  type ClassifiableItem,
} from "../src/exams.js";
import { deleteExam, getExamOverview, listExams, saveExam, setScopeExam } from "../src/exam-store.js";
import type { Exam } from "../src/types.js";

// ── Pure classification (always run) ────────────────────────────────────────

const EXAMS: Exam[] = [
  { id: 1, courseId: 1, name: "AVD1", sequence: 1, endsAt: "2026-04-30T00:00:00.000Z", createdAt: "", updatedAt: "" },
  { id: 2, courseId: 1, name: "AVD2", sequence: 2, endsAt: "2026-06-30T00:00:00.000Z", createdAt: "", updatedAt: "" },
];

function item(id: number, patch: Partial<ClassifiableItem> = {}): ClassifiableItem {
  return {
    id,
    moduleId: 10,
    moduleTitle: "Banco de Dados I",
    sectionId: 100,
    sectionTitle: "Material Didático",
    gradebookId: null,
    deadlineAt: null,
    ...patch,
  };
}

describe("exams · keyword", () => {
  it("reconhece bimester/avd/p no título", () => {
    expect(keywordExamOrder("Atividades/Tarefas - 1º Bimestre")).toBe(1);
    expect(keywordExamOrder("Exercícios - 2º Bimestre")).toBe(2);
    expect(keywordExamOrder("ARS (AVD1): Introdução à Arquitetura")).toBe(1);
    expect(keywordExamOrder("DBE - BIM2 - EXERCÍCIO 001")).toBe(2);
    expect(keywordExamOrder("DBE I - BIM 1 - Exercício 001")).toBe(1);
    expect(keywordExamOrder("Material Didático")).toBeNull();
    expect(keywordExamOrder(null)).toBeNull();
  });
});

describe("exams · date", () => {
  it("coloca a data na prova cujo término é o primeiro após ela", () => {
    expect(classifyByDate("2026-04-10T00:00:00.000Z", EXAMS)).toBe(1);
    expect(classifyByDate("2026-05-20T00:00:00.000Z", EXAMS)).toBe(2);
    expect(classifyByDate("2026-08-01T00:00:00.000Z", EXAMS)).toBe(2);
    expect(classifyByDate(null, EXAMS)).toBeNull();
  });
});

describe("exams · precedência", () => {
  it("override de item vence palavra-chave", () => {
    const items = [item(1, { sectionTitle: "Exercícios - 1º Bimestre" })];
    const resolved = resolveCourseExams(items, EXAMS, { itemExam: new Map([[1, 2]]) });
    expect(resolved.get(1)).toEqual({ examId: 2, source: "manual" });
  });

  it("override de seção/módulo conta como manual", () => {
    const bySection = resolveCourseExams([item(1)], EXAMS, { sectionExam: new Map([[100, 2]]) });
    expect(bySection.get(1)).toEqual({ examId: 2, source: "manual" });
    const byModule = resolveCourseExams([item(1)], EXAMS, { moduleExam: new Map([[10, 1]]) });
    expect(byModule.get(1)).toEqual({ examId: 1, source: "manual" });
  });

  it("classifica por palavra-chave e depois por data", () => {
    const items = [
      item(1, { sectionTitle: "Atividades - 2º Bimestre" }),
      item(2, { sectionTitle: "Sem rótulo", deadlineAt: "2026-04-01T00:00:00.000Z" }),
    ];
    const resolved = resolveCourseExams(items, EXAMS, {});
    expect(resolved.get(1)).toEqual({ examId: 2, source: "auto" });
    expect(resolved.get(2)).toEqual({ examId: 1, source: "auto" });
  });

  it("sem sinais, herda a maioria dos irmãos da mesma seção", () => {
    const items = [
      item(1, { sectionTitle: "Atividades - 1º Bimestre" }),
      item(2, { sectionTitle: "Sem rótulo" }),
      item(3, { sectionTitle: "Sem rótulo" }),
    ];
    const resolved = resolveCourseExams(items, EXAMS, {});
    expect(resolved.get(2)?.examId).toBe(1);
    expect(resolved.get(3)?.examId).toBe(1);
  });

  it("marca como neutro quando nada resolve", () => {
    const resolved = resolveCourseExams([item(1)], EXAMS, {});
    expect(resolved.get(1)).toEqual({ examId: null, source: "neutral" });
  });
});

describe("exams · filtro", () => {
  it("mantém a prova alvo e o material neutro", () => {
    const items = [item(1), item(2), item(3)];
    const resolved = resolveCourseExams(items, EXAMS, {
      itemExam: new Map([
        [1, 1],
        [2, 2],
      ]),
    });
    expect(filterItemsForExam(items, resolved, 1).map((i) => i.id)).toEqual([1, 3]);
    expect(filterItemsForExam(items, resolved, null).map((i) => i.id)).toEqual([1, 2, 3]);
  });

  it("maioria escolhe o valor dominante", () => {
    expect(majorityExamId([1, 1, 2])).toBe(1);
    expect(majorityExamId([])).toBeNull();
  });
});

// ── Postgres round-trip (gated by LXP_TEST_DB=1) ────────────────────────────

const enabled = process.env.LXP_TEST_DB === "1";
const COURSE = 9_999_993_001;
const MODULE = 9_999_993_002;
const SECTION = 9_999_993_003;
const ITEM = 9_999_993_004;

describe.skipIf(!enabled)("exam store (Postgres)", () => {
  beforeAll(async () => {
    await runMigrations();
    await query("INSERT INTO course(id, name) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING", [
      COURSE,
      "Curso de provas",
    ]);
    await query(
      "INSERT INTO module(id, course_id, title, name) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING",
      [MODULE, COURSE, "Banco de Dados I", "Banco de Dados I"],
    );
    await query(
      "INSERT INTO section(id, module_id, title) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING",
      [SECTION, MODULE, "Atividades - 1º Bimestre"],
    );
    await query(
      `INSERT INTO content_item(id, course_id, module_id, section_id, topic_type_id, kind, title)
       VALUES ($1,$2,$3,$4,15,'quiz','Quiz de prova') ON CONFLICT (id) DO NOTHING`,
      [ITEM, COURSE, MODULE, SECTION],
    );
  });

  afterAll(async () => {
    await query("DELETE FROM content_item WHERE id = $1", [ITEM]);
    await query("DELETE FROM section WHERE id = $1", [SECTION]);
    await query("DELETE FROM module WHERE id = $1", [MODULE]);
    await query("DELETE FROM course WHERE id = $1", [COURSE]);
    await closePool();
  });

  it("salva, lista, atribui escopo e remove provas", async () => {
    const avd1 = await saveExam(COURSE, { name: "AVD1", sequence: 1, endsAt: "2026-04-30T00:00:00.000Z" });
    const avd2 = await saveExam(COURSE, { name: "AVD2", sequence: 2, endsAt: "2026-06-30T00:00:00.000Z" });
    const exams = await listExams(COURSE);
    expect(exams.map((e) => e.name)).toEqual(["AVD1", "AVD2"]);

    await setScopeExam("module", MODULE, avd1.id);
    const overview = await getExamOverview(COURSE);
    const mod = overview.assignments.find((a) => a.scopeType === "module" && a.scopeId === MODULE);
    expect(mod?.examId).toBe(avd1.id);
    expect(mod?.source).toBe("manual");
    // The section inherits the module override → auto.
    const sec = overview.assignments.find((a) => a.scopeType === "section" && a.scopeId === SECTION);
    expect(sec?.examId).toBe(avd1.id);

    await deleteExam(avd2.id);
    expect((await listExams(COURSE)).map((e) => e.name)).toEqual(["AVD1"]);
  });
});
