import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LangProvider } from "@/lib/i18n";
import type { Exercise, GateResultDto } from "@/types";
import { GatePanel } from "./gate-panel";

vi.mock("@/api", () => ({ analyzeDraftGate: vi.fn() }));

function hashDraft(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}:${h}`;
}

const exercise = { id: 1 } as unknown as Exercise;
const draft = "Resposta do aluno.";

function result(patch: Partial<GateResultDto> = {}): GateResultDto {
  return {
    verdict: "good",
    reason: "Tudo certo.",
    model: "gpt-5-nano",
    draftHash: hashDraft(draft.trim()),
    ...patch,
  };
}

describe("GatePanel", () => {
  beforeEach(() => {
    window.localStorage.setItem("pauta-lang", "pt");
  });
  afterEach(() => {
    cleanup();
    window.localStorage.removeItem("pauta-lang");
  });

  it("shows a generated judgment without pressing Analyze", () => {
    render(
      <LangProvider>
        <GatePanel e={exercise} draft={draft} initial={result()} />
      </LangProvider>,
    );
    expect(screen.getAllByText("Boa").length).toBeGreaterThan(0);
    expect(screen.getByText("Tudo certo.")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("clears the judgment when the draft changes", () => {
    const { rerender } = render(
      <LangProvider>
        <GatePanel e={exercise} draft={draft} initial={result()} />
      </LangProvider>,
    );
    expect(screen.getByText("Tudo certo.")).toBeInTheDocument();

    rerender(
      <LangProvider>
        <GatePanel e={exercise} draft={`${draft} editada`} initial={result()} />
      </LangProvider>,
    );
    expect(screen.queryByText("Tudo certo.")).not.toBeInTheDocument();
  });
});
