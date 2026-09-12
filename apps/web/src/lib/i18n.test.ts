import { describe, expect, it } from "vitest";
import {
  interpolate,
  localeFor,
  serverStepKey,
  translate,
  translatePlural,
  type Lang,
} from "./i18n";
import { pt } from "./i18n/pt";
import { en } from "./i18n/en";

describe("dicionários", () => {
  it("pt e en cobrem exatamente o mesmo conjunto de chaves", () => {
    const ptKeys = Object.keys(pt).sort();
    const enKeys = Object.keys(en).sort();
    const onlyPt = ptKeys.filter((k) => !enKeys.includes(k));
    const onlyEn = enKeys.filter((k) => !ptKeys.includes(k));
    expect({ onlyPt, onlyEn }).toEqual({ onlyPt: [], onlyEn: [] });
  });

  it("nenhuma chave traduzida fica vazia", () => {
    for (const dict of [pt, en]) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim(), `chave vazia: ${key}`).not.toBe("");
      }
    }
  });
});

describe("translate", () => {
  it("busca no dicionário ativo", () => {
    expect(translate("pt", "lang.title")).toBe(pt["lang.title"]);
    expect(translate("en", "lang.title")).toBe(en["lang.title"]);
  });

  it("faz fallback para pt quando a chave falta no idioma ativo", () => {
    const lang: Lang = "en";
    const ptRecord = pt as Record<string, string>;
    const enRecord = en as Record<string, string>;
    const key = Object.keys(ptRecord)[0];
    delete enRecord[key];
    try {
      expect(translate(lang, key)).toBe(ptRecord[key]);
    } finally {
      enRecord[key] = ptRecord[key];
    }
  });

  it("retorna a própria chave quando não existe em nenhum dicionário", () => {
    expect(translate("pt", "chave.inexistente")).toBe("chave.inexistente");
  });

  it("interpola variáveis", () => {
    expect(translate("pt", "status.lateDays", { n: 3 })).toMatch(/3/);
  });
});

describe("interpolate", () => {
  it("substitui tokens presentes em vars", () => {
    expect(interpolate("Olá {{nome}}, faltam {{n}} dias", { nome: "Ana", n: 2 })).toBe(
      "Olá Ana, faltam 2 dias",
    );
  });

  it("mantém tokens sem valor fornecido", () => {
    expect(interpolate("Olá {{nome}}")).toBe("Olá {{nome}}");
    expect(interpolate("Olá {{nome}}", { outro: "x" })).toBe("Olá {{nome}}");
  });
});

describe("translatePlural", () => {
  it("usa `one` quando n === 1 e `other` caso contrário", () => {
    const one = translatePlural("en", "status.dueIn", 1, { n: 1 });
    const other = translatePlural("en", "status.dueIn", 5, { n: 5 });
    expect(one).toBeTruthy();
    expect(other).toBeTruthy();
    expect(one === other).toBe(false);
  });
});

describe("localeFor / serverStepKey", () => {
  it("mapeia lang → locale BCP47", () => {
    expect(localeFor("pt")).toBe("pt-BR");
    expect(localeFor("en")).toBe("en-US");
  });

  it("mapeia mensagens conhecidas do server para chaves de dicionário", () => {
    expect(serverStepKey("Buscando conteúdo novo no portal")).toBe("server.step.fetching");
    expect(serverStepKey("Concluído")).toBe("server.step.done");
    expect(serverStepKey("Falhou")).toBe("server.step.failed");
  });

  it("passa texto desconhecido sem alteração", () => {
    expect(serverStepKey("Passo aleatório")).toBe("Passo aleatório");
  });
});
