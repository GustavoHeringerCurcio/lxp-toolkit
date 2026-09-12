import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LanguageToggle } from "@/components/language-toggle";
import { LangProvider, useT } from "@/lib/i18n";

function LangProbe() {
  const { lang } = useT();
  return <span data-testid="lang-probe">{lang}</span>;
}

function renderToggle() {
  return render(
    <LangProvider>
      <LanguageToggle />
      <LangProbe />
    </LangProvider>,
  );
}

describe("LanguageToggle", () => {
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("pauta-lang", "pt");
  });

  it("abre o menu e troca para inglês ao clicar em English", async () => {
    const user = userEvent.setup();
    renderToggle();
    expect(screen.getByTestId("lang-probe")).toHaveTextContent("pt");

    await user.click(screen.getByRole("button", { name: /mudar idioma/i }));
    await user.click(await screen.findByRole("menuitemradio", { name: /english/i }));

    expect(screen.getByTestId("lang-probe")).toHaveTextContent("en");
    expect(localStorage.getItem("pauta-lang")).toBe("en");
    expect(document.documentElement.lang).toBe("en-US");
  });

  it("persiste a escolha e continua em inglês após remontar", async () => {
    const user = userEvent.setup();
    const { unmount } = renderToggle();
    await user.click(screen.getByRole("button", { name: /mudar idioma/i }));
    await user.click(await screen.findByRole("menuitemradio", { name: /english/i }));
    unmount();

    renderToggle();
    expect(screen.getByTestId("lang-probe")).toHaveTextContent("en");
  });
});
