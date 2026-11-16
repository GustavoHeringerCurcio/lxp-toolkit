import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LangProvider } from "@/lib/i18n";
import type { Exercise } from "@/types";

const mocks = vi.hoisted(() => ({
  fetchActivityAbilities: vi.fn(),
  setActivityAbility: vi.fn(),
  generateDiagram: vi.fn(),
}));

vi.mock("@/api", () => mocks);
vi.mock("@/lib/app-state", () => ({
  useAppData: () => ({
    cfg: {
      abilityRegistry: [
        {
          id: "uml_diagram",
          label: "Diagrama UML",
          description: "desc",
          defaultOn: false,
          artifact: true,
        },
      ],
      abilities: { uml_diagram: true },
    },
    patchExercise: vi.fn(),
  }),
}));

import { AbilityPanel } from "./ability-panel";

const exercise = { id: 1, kind: "upload", flavor: "question" } as Exercise;

describe("AbilityPanel", () => {
  beforeEach(() => {
    window.localStorage.setItem("pauta-lang", "pt");
    mocks.fetchActivityAbilities.mockResolvedValue({});
    mocks.setActivityAbility.mockResolvedValue({ uml_diagram: false });
  });
  afterEach(() => {
    cleanup();
    window.localStorage.removeItem("pauta-lang");
    vi.clearAllMocks();
  });

  it("turns the ability off and keeps the returned object map", async () => {
    render(
      <LangProvider>
        <AbilityPanel e={exercise} draft="resposta" />
      </LangProvider>,
    );
    const checkbox = await screen.findByRole("checkbox");
    await waitFor(() => expect(checkbox).toBeChecked());

    fireEvent.click(checkbox);

    await waitFor(() => expect(checkbox).not.toBeChecked());
    expect(mocks.setActivityAbility).toHaveBeenCalledWith(1, "uml_diagram", false);
  });
});
