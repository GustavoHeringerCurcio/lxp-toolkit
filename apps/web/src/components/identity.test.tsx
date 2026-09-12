import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SubjectAvatar } from "@/components/identity";

describe("SubjectAvatar", () => {
  afterEach(cleanup);

  it("usa o monograma quando não há ícone de domínio", () => {
    const { container } = render(<SubjectAvatar moduleName="Metodologia Científica" />);
    expect(container.textContent).toBe("MC");
    expect(container.querySelector("svg")).toBeNull();
  });

  it("troca o monograma pelo pictograma de domínio quando reconhece a matéria", () => {
    const { container } = render(<SubjectAvatar moduleName="Banco de Dados" />);
    expect(container.textContent).not.toBe("BD");
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("mostra a foto quando `imageUrl` é informado", () => {
    const { container } = render(
      <SubjectAvatar moduleName="Banco de Dados" imageUrl="/api/professor-avatar/1?v=x" />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("src", "/api/professor-avatar/1?v=x");
  });

  it("volta para o pictograma quando a foto falha ao carregar", () => {
    const { container } = render(
      <SubjectAvatar moduleName="Banco de Dados" imageUrl="/api/professor-avatar/1?v=x" />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    fireEvent.error(img!);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
