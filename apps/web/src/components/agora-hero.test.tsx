import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProgressSummary } from "@/components/agora-hero";
import { LangProvider } from "@/lib/i18n";

const modules = [
  { name: "Cálculo", done: 3, open: 1, late: 0, total: 4 },
  { name: "Álgebra", done: 1, open: 2, late: 1, total: 4 },
];
const totals = { done: 4, late: 1, open: 3, total: 8 };

function renderSummary(onSelect?: (name: string) => void) {
  return render(
    <LangProvider>
      <ProgressSummary modules={modules} totals={totals} onSelect={onSelect} />
    </LangProvider>,
  );
}

describe("ProgressSummary", () => {
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("pauta-lang", "pt");
  });

  it("expande ao clicar em qualquer lugar do card", async () => {
    const user = userEvent.setup();
    renderSummary();

    const toggle = screen.getByRole("button", { expanded: false });
    await user.click(screen.getByText("concluídas"));

    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("seleciona o módulo sem recolher o card", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderSummary(onSelect);

    await user.click(screen.getByRole("button", { expanded: false }));
    await user.click(screen.getByRole("button", { name: /Cálculo/ }));

    expect(onSelect).toHaveBeenCalledWith("Cálculo");
    expect(screen.getByRole("button", { expanded: true })).toBeInTheDocument();
  });
});
