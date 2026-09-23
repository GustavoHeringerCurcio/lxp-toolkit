import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, query, runMigrations } from "../src/db.js";
import {
  buildFinalSummaryMessages,
  buildItemBlock,
  buildPartialMessages,
  chunkItems,
  isSinglePass,
  normalizeSummaryMarkdown,
  normalizeSummarySize,
  SIZE_PROFILES,
  SUMMARY_SIZES,
  summarizeItems,
} from "../src/summary.js";
import { getStudySummary, saveStudySummary } from "../src/summary-store.js";
import type { ContextItem, SubjectContext } from "../src/training.js";

// ── Pure chunking + prompts (always run) ────────────────────────────────────

function item(id: number, moduleName: string | null, material = "Conteúdo da apostila."): ContextItem {
  return {
    id,
    title: `Item ${id}`,
    kind: "pdf",
    moduleName,
    sectionTitle: null,
    instructions: "",
    material,
    questions: [],
    fileNames: [],
    hidden: false,
  };
}

function ctxFixture(): SubjectContext {
  return {
    courseId: 1,
    courseName: "Curso X",
    moduleId: null,
    moduleName: null,
    items: [],
    questions: [{ id: 1, text: "Pergunta real?", options: ["a", "b"], itemId: 9, itemTitle: "Q" }],
    text: "material",
  };
}

describe("summary · chunking e prompts", () => {
  it("inclui título, material e questões no bloco de um item", () => {
    const ctx: ContextItem = {
      ...item(1, "Banco de Dados"),
      instructions: "Leia o capítulo 1.",
      questions: [
        { id: 7, text: "O que é uma PK?", options: ["chave", "tabela"], itemId: 1, itemTitle: "Item 1" },
      ],
      fileNames: ["aula.pdf"],
    };
    const block = buildItemBlock(ctx);
    expect(block).toContain("Item 1");
    expect(block).toContain("Conteúdo da apostila.");
    expect(block).toContain("Q7. O que é uma PK?");
    expect(block).toContain("a) chave");
    expect(block).toContain("aula.pdf");
  });

  it("empacota tudo num único chunk quando cabe", () => {
    const chunks = chunkItems([item(1, "A"), item(2, "A"), item(3, "B")], 100_000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].itemCount).toBe(3);
    expect(chunks[0].label).toBe("A · B");
  });

  it("divide em vários chunks e soma todos os itens", () => {
    const big = "x".repeat(400);
    const items = Array.from({ length: 6 }, (_, i) => item(i + 1, `M${i}`, big));
    const chunks = chunkItems(items, 900);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.reduce((n, c) => n + c.itemCount, 0)).toBe(6);
  });

  it("detecta quando o resumo cabe numa única passada", () => {
    expect(isSinglePass([item(1, "A")], 100_000)).toBe(true);
    expect(isSinglePass([item(1, "A", "y".repeat(2000))], 500)).toBe(false);
  });

  it("monta o prompt parcial e o final com as seções pedidas", () => {
    const ctx = ctxFixture();
    const partial = buildPartialMessages(ctx, { label: "M1", text: "material", itemCount: 1 });
    expect(partial.find((m) => m.role === "user")?.content).toContain("material");

    const final = buildFinalSummaryMessages(ctx, "notas consolidadas");
    const user = final.find((m) => m.role === "user")?.content ?? "";
    expect(user).toContain("## Questões prováveis");
    expect(user).toContain("Pergunta real?");
  });
});

describe("summary · tamanhos", () => {
  it("normaliza o tamanho e escala os tokens", () => {
    expect(SUMMARY_SIZES).toEqual(["small", "medium", "big", "extra"]);
    expect(normalizeSummarySize("big")).toBe("big");
    expect(normalizeSummarySize("huge")).toBe("medium");
    expect(normalizeSummarySize(null)).toBe("medium");
    expect(SIZE_PROFILES.extra.maxTokens).toBeGreaterThan(SIZE_PROFILES.small.maxTokens);
    expect(SIZE_PROFILES.medium.questions).toBeLessThan(SIZE_PROFILES.big.questions);
  });

  it("o prompt final muda com o tamanho", () => {
    const ctx = ctxFixture();
    const small = buildFinalSummaryMessages(ctx, "m", "small").find((m) => m.role === "user")?.content ?? "";
    const extra = buildFinalSummaryMessages(ctx, "m", "extra").find((m) => m.role === "user")?.content ?? "";
    expect(small).toContain("1 página");
    expect(extra).toContain("6 páginas");
    expect(small).not.toBe(extra);
  });

  it("faz o snapshot compacto dos itens usados", () => {
    const items = summarizeItems([
      {
        ...item(1, "Banco de Dados I"),
        fileNames: ["apostila.pdf"],
        hidden: true,
        questions: [{ id: 1, text: "Q?", options: ["a"], itemId: 1, itemTitle: "Item 1" }],
      },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 1,
      kind: "pdf",
      moduleName: "Banco de Dados I",
      files: ["apostila.pdf"],
      questions: 1,
      hidden: true,
    });
  });

  it("remove a cerca de código que envolve a resposta inteira", () => {
    const fenced = '```markdown\n## Visão geral\n\n- um\n\n- dois\n```';
    expect(normalizeSummaryMarkdown(fenced)).toBe("## Visão geral\n\n- um\n\n- dois");
    // Without a language tag too.
    expect(normalizeSummaryMarkdown("```\n# Título\n```")).toBe("# Título");
    // Real content is untouched.
    expect(normalizeSummaryMarkdown("## Direto\n- um")).toBe("## Direto\n- um");
    // Multiple fences = legitimate code blocks; keep verbatim.
    const multi = "texto\n```sql\nSELECT 1;\n```\nfim";
    expect(normalizeSummaryMarkdown(multi)).toBe(multi);
    // Unterminated fence; keep verbatim.
    expect(normalizeSummaryMarkdown("```markdown\nincompleto")).toBe("```markdown\nincompleto");
  });
});

// ── Postgres round-trip (gated by LXP_TEST_DB=1) ────────────────────────────

const enabled = process.env.LXP_TEST_DB === "1";
const COURSE = 9_999_992_001;
const MODULE = 9_999_992_002;

describe.skipIf(!enabled)("summary store (Postgres)", () => {
  beforeAll(async () => {
    await runMigrations();
    // Clean any rows left by a previously aborted run (module CASCADE/SET NULL
    // can otherwise collide with the whole-course scope).
    await query("DELETE FROM study_summary WHERE course_id = $1", [COURSE]).catch(() => undefined);
    await query("INSERT INTO course(id, name) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING", [
      COURSE,
      "Curso de resumo",
    ]);
    await query(
      "INSERT INTO module(id, course_id, title) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING",
      [MODULE, COURSE, "Módulo de resumo"],
    );
  });

  afterAll(async () => {
    await query("DELETE FROM study_summary WHERE course_id = $1", [COURSE]);
    await query("DELETE FROM module WHERE id = $1", [MODULE]);
    await query("DELETE FROM course WHERE id = $1", [COURSE]);
    await closePool();
  });

  it("salva e recupera o resumo de uma matéria, e faz upsert ao regerar", async () => {
    const first = await saveStudySummary({
      courseId: COURSE,
      moduleId: null,
      size: "medium",
      subjectLabel: "Curso de resumo",
      content: "# Primeiro",
      model: "gpt-4o",
      promptHash: "h1",
      itemCount: 3,
      items: [{ id: 1, title: "Item", kind: "pdf", moduleName: null, sectionTitle: null, files: [], questions: 0, hidden: false }],
    });
    expect(first.content).toBe("# Primeiro");
    expect(first.charCount).toBe("# Primeiro".length);
    expect(first.items).toHaveLength(1);

    const loaded = await getStudySummary(COURSE, null, null, "medium");
    expect(loaded?.id).toBe(first.id);
    expect(loaded?.itemCount).toBe(3);

    const second = await saveStudySummary({
      courseId: COURSE,
      moduleId: null,
      size: "medium",
      subjectLabel: "Curso de resumo",
      content: "# Segundo",
      model: "gpt-4o",
      promptHash: "h2",
      itemCount: 4,
      items: [],
    });
    expect(second.id).toBe(first.id);
    expect(second.content).toBe("# Segundo");
  });

  it("mantém um resumo por tamanho", async () => {
    await saveStudySummary({
      courseId: COURSE,
      moduleId: null,
      size: "big",
      subjectLabel: "Curso de resumo",
      content: "# Grande",
      model: null,
      promptHash: null,
      itemCount: 9,
      items: [],
    });
    expect((await getStudySummary(COURSE, null, null, "medium"))?.content).toBe("# Segundo");
    expect((await getStudySummary(COURSE, null, null, "big"))?.content).toBe("# Grande");
  });

  it("não confunde o escopo do curso com o do módulo", async () => {
    await saveStudySummary({
      courseId: COURSE,
      moduleId: MODULE,
      size: "medium",
      subjectLabel: "Curso de resumo · Módulo",
      content: "# Módulo",
      model: null,
      promptHash: null,
      itemCount: 1,
      items: [],
    });
    const course = await getStudySummary(COURSE, null, null, "medium");
    const module = await getStudySummary(COURSE, MODULE, null, "medium");
    expect(course?.content).toBe("# Segundo");
    expect(module?.content).toBe("# Módulo");
  });
});
