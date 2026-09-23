import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Markdown, parseMarkdown } from "@/lib/markdown";

describe("Markdown", () => {
  afterEach(cleanup);

  it("renderiza títulos como blocos de heading", () => {
    const { container } = render(<Markdown content={"## Visão geral\n\nTexto."} />);
    const paragraphs = Array.from(container.querySelectorAll("p"));
    expect(paragraphs.some((p) => p.textContent === "Visão geral")).toBe(true);
    expect(container.textContent).toContain("Texto.");
  });

  it("agrupa listas não ordenadas", () => {
    const { container } = render(<Markdown content={"- um\n- dois\n- três"} />);
    const items = container.querySelectorAll("ul li");
    expect(items).toHaveLength(3);
    expect(items[1].textContent).toBe("dois");
  });

  it("agrupa listas ordenadas", () => {
    const { container } = render(<Markdown content={"1. primeiro\n2. segundo"} />);
    expect(container.querySelectorAll("ol li")).toHaveLength(2);
  });

  it("aplica negrito, itálico e código inline", () => {
    const { container } = render(<Markdown content={"Use **forte**, *ênfase* e `código`."} />);
    expect(container.querySelector("strong")?.textContent).toBe("forte");
    expect(container.querySelector("em")?.textContent).toBe("ênfase");
    expect(container.querySelector("code")?.textContent).toBe("código");
  });

  it("renderiza links seguros e ignora href perigoso", () => {
    const { container } = render(
      <Markdown content={"[ok](https://exemplo.com) e [mal](javascript:alert(1))"} />,
    );
    const link = container.querySelector("a");
    expect(link).not.toBeNull();
    expect(link).toHaveAttribute("href", "https://exemplo.com");
    expect(container.querySelectorAll("a")).toHaveLength(1);
    expect(container.textContent).toContain("[mal](javascript:alert(1))");
  });

  it("renderiza blocos de código cercados", () => {
    const { container } = render(<Markdown content={"```ts\nconst x = 1;\n```"} />);
    const code = container.querySelector("pre code");
    expect(code?.textContent).toContain("const x = 1;");
  });

  it("renderiza citações", () => {
    const { container } = render(<Markdown content={"> nota importante"} />);
    expect(container.querySelector("blockquote")?.textContent).toContain("nota importante");
  });

  it("retorna vazio para conteúdo em branco", () => {
    expect(parseMarkdown("")).toHaveLength(0);
  });
});
