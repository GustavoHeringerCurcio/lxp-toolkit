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

  it("renderiza blocos de código no meio do conteúdo", () => {
    const { container } = render(<Markdown content={"Antes:\n```ts\nconst x = 1;\n```\nDepois."} />);
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

  it("desembrulha a cerca ```markdown que envolve a resposta inteira", () => {
    const { container } = render(
      <Markdown content={"```markdown\n## Visão geral\n\n- um\n```"} />,
    );
    // Rendered as heading + list, never as a raw code block.
    expect(container.querySelector("pre")).toBeNull();
    expect(container.querySelector("ul li")?.textContent).toBe("um");
    expect(container.textContent).toContain("Visão geral");
  });

  it("agrupa itens separados por linha em branco numa única lista", () => {
    const { container } = render(<Markdown content={"- um\n\n- dois\n\n- três"} />);
    expect(container.querySelectorAll("ul")).toHaveLength(1);
    expect(container.querySelectorAll("ul li")).toHaveLength(3);
  });

  it("mantém blocos de código reais quando há mais de uma cerca", () => {
    const { container } = render(
      <Markdown content={"texto\n```sql\nSELECT 1;\n```\nfim"} />,
    );
    expect(container.querySelector("pre code")?.textContent).toContain("SELECT 1;");
  });

  it("remove IDs de questões vazados do texto", () => {
    const { container } = render(
      <Markdown content={"Questões prováveis\n\n1. **Q36049942:** Requisitos não funcionais dizem respeito a qualidade."} />,
    );
    expect(container.textContent).not.toContain("36049942");
    expect(container.textContent).not.toContain("****");
    expect(container.textContent).toContain("Requisitos não funcionais");
  });

  it("aninha listas por indentação", () => {
    const md = "- Requisitos de Software:\n  - Funcionais: o que\n  - Não funcionais: como\n- Qualidade:";
    const { container } = render(<Markdown content={md} />);
    const outer = container.querySelector("ul");
    expect(outer?.children.length).toBe(2); // dois itens de topo
    const nested = outer?.querySelector("ul");
    expect(nested).not.toBeNull();
    expect(nested?.querySelectorAll("li").length).toBe(2);
  });
});
