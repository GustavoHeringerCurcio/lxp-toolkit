import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, query, runMigrations } from "../src/db.js";
import {
  appendSubmission,
  clearAnswerHistory,
  getAnswers,
  getOverrides,
  getStudentId,
  lastSubmission,
  restoreAnswerVersion,
  saveAiRequest,
  saveAnswerVersion,
  saveNote,
  setManualStatus,
} from "../src/store.js";

/**
 * Integration tests for the Postgres store. They mutate the database, so they
 * only run when `LXP_TEST_DB=1` (set in CI). Locally they are skipped to avoid
 * touching a real user's data.
 */
const enabled = process.env.LXP_TEST_DB === "1";

const COURSE = 9_999_990_001;
const MODULE = 9_999_990_002;
const ITEM = 9_999_990_003;

describe.skipIf(!enabled)("store (Postgres)", () => {
  beforeAll(async () => {
    await runMigrations();
    const studentId = await getStudentId();
    await query(
      "INSERT INTO course(id, name) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING",
      [COURSE, "Curso de teste"],
    );
    await query(
      "INSERT INTO module(id, course_id, title) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING",
      [MODULE, COURSE, "Módulo de teste"],
    );
    await query(
      `INSERT INTO content_item(id, course_id, module_id, topic_type_id, kind, title, raw_json)
       VALUES ($1,$2,$3,8,'file_upload','Item de teste','{}'::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [ITEM, COURSE, MODULE],
    );
    void studentId;
  });

  afterAll(async () => {
    await query("DELETE FROM content_item WHERE id = $1", [ITEM]);
    await query("DELETE FROM module WHERE id = $1", [MODULE]);
    await query("DELETE FROM course WHERE id = $1", [COURSE]);
    await closePool();
  });

  it("cria a primeira resposta e mantém histórico ao mudar", async () => {
    const first = await saveAnswerVersion(ITEM, "v1", "manual");
    expect(first.answer).toBe("v1");
    expect(first.history).toHaveLength(0);

    const second = await saveAnswerVersion(ITEM, "v2", "ai");
    expect(second.answer).toBe("v2");
    expect(second.history.map((h) => h.answer)).toEqual(["v1"]);

    const answers = await getAnswers();
    expect(answers[String(ITEM)].answer).toBe("v2");
  });

  it("não duplica histórico quando o conteúdo é igual", async () => {
    const rec = await saveAnswerVersion(ITEM, "v2", "ai");
    expect(rec.history).toHaveLength(1);
  });

  it("restaura uma versão do histórico", async () => {
    const rec = await restoreAnswerVersion(ITEM, 0);
    expect(rec.answer).toBe("v1");
    expect(rec.history.map((h) => h.answer)).toEqual(["v2"]);
  });

  it("limpa o histórico mantendo a atual", async () => {
    const rec = await clearAnswerHistory(ITEM);
    expect(rec.answer).toBe("v1");
    expect(rec.history).toHaveLength(0);
  });

  it("grava notas, aiRequest e status manual nas annotations", async () => {
    await saveNote(ITEM, "minha nota");
    await saveAiRequest(ITEM, JSON.stringify({ perfil: "p", instrucoes: [], contexto: "c" }));
    await setManualStatus(ITEM, "done");
    const overrides = await getOverrides();
    expect(overrides[String(ITEM)].notes).toBe("minha nota");
    expect(overrides[String(ITEM)].manualStatus).toBe("done");
    expect(overrides[String(ITEM)].aiRequest).toContain('"perfil"');
  });

  it("insere e atualiza um submission pelo par (item, at)", async () => {
    const at = new Date().toISOString();
    await appendSubmission({ exerciseId: ITEM, at, status: "running", detail: "iniciando" });
    await appendSubmission({ exerciseId: ITEM, at, status: "ok", detail: "enviado", mode: "txt" });
    const last = await lastSubmission(ITEM);
    expect(last?.status).toBe("ok");
    expect(last?.detail).toBe("enviado");
  });
});
