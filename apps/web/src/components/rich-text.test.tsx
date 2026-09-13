import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RichText } from "@/components/rich-text";

describe("RichText", () => {
  afterEach(cleanup);

  it("renderiza parágrafos, listas e negrito", () => {
    const { container } = render(
      <RichText html="<p>Um <strong>dois</strong></p><ul><li>a</li><li>b</li></ul>" />,
    );
    expect(screen.getByText("dois").tagName).toBe("STRONG");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(container.querySelector("p")).not.toBeNull();
  });

  it("desembrulha tags desconhecidas e ignora scripts", () => {
    render(<RichText html="<p>Veja <foo>o anexo</foo></p><script>alert(1)</script>" />);
    expect(screen.getByText(/Veja o anexo/)).toBeTruthy();
    expect(screen.queryByText("alert(1)")).toBeNull();
  });

  it("não cria link para href inseguro", () => {
    const { container } = render(<RichText html={'<p><a href="javascript:alert(1)">x</a></p>'} />);
    expect(container.querySelector("a")).toBeNull();
  });

  it("usa o fallback em texto simples quando não há html", () => {
    render(<RichText html={null} fallback={"linha 1\nlinha 2"} />);
    expect(screen.getByText(/linha 1/).textContent).toContain("linha 2");
  });

  it("descarta parágrafos vazios e preserva o alinhamento", () => {
    const { container } = render(
      <RichText html={`<div data-align="justify"><p>Texto</p><p></p></div>`} />,
    );
    expect(container.querySelectorAll("p")).toHaveLength(1);
    expect(container.querySelector("div.text-justify")).not.toBeNull();
  });

  it("renderiza imagens seguras e ignora fontes inseguras", () => {
    const { container } = render(
      <RichText html={`<img src="https://x.test/a.jpg" alt="capa"><img src="javascript:alert(1)">`} />,
    );
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("capa");
  });
});
