import { describe, expect, it } from "vitest";
import {
  hiddenDuplicatesCount,
  isActionableHidden,
  isCurrentHidden,
  isPastDeadline,
  visibleHiddenItems,
} from "./gods-eye";
import type { Exercise } from "../types";

function item(overrides: Partial<Exercise>): Exercise {
  return {
    id: 1,
    title: "Item",
    kind: "other",
    done: false,
    hasDeadline: false,
    deadlineAt: null,
    gradebookId: null,
    questions: [],
    duplicate: false,
    ...overrides,
  } as Exercise;
}

const NOW = new Date("2026-10-21T12:00:00").getTime();
const FUTURE = "2027-01-01 10:00:00";
const PAST = "2025-01-01 10:00:00";

describe("isActionableHidden", () => {
  it("considera quizzes, uploads e fóruns acionáveis mesmo sem metadados", () => {
    expect(isActionableHidden(item({ kind: "quiz" }))).toBe(true);
    expect(isActionableHidden(item({ kind: "upload" }))).toBe(true);
    expect(isActionableHidden(item({ kind: "forum" }))).toBe(true);
  });

  it("considera ação/nota/questões acionáveis em outros tipos", () => {
    expect(isActionableHidden(item({ kind: "other", hasDeadline: true }))).toBe(true);
    expect(isActionableHidden(item({ kind: "other", gradebookId: 42 }))).toBe(true);
    expect(isActionableHidden(item({ kind: "other", questions: [{ id: 1 }] as Exercise["questions"] }))).toBe(true);
    expect(isActionableHidden(item({ kind: "other" }))).toBe(false);
  });
});

describe("old-items filtering", () => {
  it("detecta prazo estritamente no passado", () => {
    expect(isPastDeadline(item({ deadlineAt: "2026-10-20 10:00:00" }), NOW)).toBe(true);
    expect(isPastDeadline(item({ deadlineAt: "2026-10-22 10:00:00" }), NOW)).toBe(false);
    expect(isPastDeadline(item({ deadlineAt: null }), NOW)).toBe(false);
  });

  it("current = não concluído e com prazo de hoje em diante", () => {
    expect(isCurrentHidden(item({ deadlineAt: "2026-10-20 10:00:00" }), NOW)).toBe(false);
    expect(isCurrentHidden(item({ deadlineAt: "2026-10-21 18:00:00" }), NOW)).toBe(true);
    expect(isCurrentHidden(item({ deadlineAt: "2026-10-22 10:00:00" }), NOW)).toBe(true);
    expect(isCurrentHidden(item({ done: true, deadlineAt: FUTURE }), NOW)).toBe(false);
  });

  it("sem prazo só permanece quando tem vínculo com o boletim", () => {
    expect(isCurrentHidden(item({ deadlineAt: null }), NOW)).toBe(false);
    expect(isCurrentHidden(item({ deadlineAt: null, gradebookId: 42 }), NOW)).toBe(true);
  });

  it("nunca mostra antigos, mesmo com o toggle ligado", () => {
    const old = item({ id: 1, kind: "upload", deadlineAt: PAST });
    const current = item({ id: 2, kind: "upload", deadlineAt: FUTURE });
    expect(visibleHiddenItems([old, current], true, NOW).map((e) => e.id)).toEqual([2]);
    expect(visibleHiddenItems([old, current], false, NOW).map((e) => e.id)).toEqual([2]);
  });
});

describe("visibleHiddenItems", () => {
  const actionableDuplicate = item({ id: 1, kind: "upload", deadlineAt: FUTURE, duplicate: true });
  const oldReading = item({ id: 2, kind: "other", deadlineAt: FUTURE, duplicate: true });
  const unique = item({ id: 3, kind: "other", deadlineAt: FUTURE, duplicate: false });

  it("esconde só duplicatas não acionáveis por padrão", () => {
    expect(visibleHiddenItems([actionableDuplicate, oldReading, unique], false, NOW).map((e) => e.id)).toEqual([
      1, 3,
    ]);
  });

  it("mostra tudo quando o usuário pede versões antigas", () => {
    expect(visibleHiddenItems([actionableDuplicate, oldReading, unique], true, NOW)).toHaveLength(3);
  });

  it("conta só duplicatas não acionáveis e ainda atuais", () => {
    const oldDuplicate = item({ id: 4, kind: "other", duplicate: true, deadlineAt: PAST });
    expect(hiddenDuplicatesCount([actionableDuplicate, oldReading, unique, oldDuplicate], NOW)).toBe(1);
  });
});
