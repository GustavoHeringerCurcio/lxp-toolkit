import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useLocalStorage } from "./use-local-storage";

afterEach(() => {
  localStorage.clear();
});

describe("useLocalStorage", () => {
  it("retorna o valor inicial quando a chave não existe", () => {
    const { result } = renderHook(() => useLocalStorage("t:empty", { a: 1 }));
    expect(result.current[0]).toEqual({ a: 1 });
  });

  it("lê e desserializa o valor salvo (JSON)", () => {
    localStorage.setItem("t:json", JSON.stringify([1, 2, 3]));
    const { result } = renderHook(() => useLocalStorage<number[]>("t:json", []));
    expect(result.current[0]).toEqual([1, 2, 3]);
  });

  it("set persiste JSON e atualiza o estado", () => {
    const { result } = renderHook(() => useLocalStorage("t:set", "inicial"));
    act(() => result.current[1]("novo"));
    expect(result.current[0]).toBe("novo");
    expect(localStorage.getItem("t:set")).toBe(JSON.stringify("novo"));
  });

  it("aceita updater funcional", () => {
    const { result } = renderHook(() => useLocalStorage("t:fn", 10));
    act(() => result.current[1]((prev) => prev + 5));
    expect(result.current[0]).toBe(15);
  });

  it("JSON inválido no storage cai no valor inicial", () => {
    localStorage.setItem("t:bad", "{inválido");
    const { result } = renderHook(() => useLocalStorage("t:bad", "fallback"));
    expect(result.current[0]).toBe("fallback");
  });
});
