import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let tmp = "";

vi.mock("../src/paths.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/paths.js")>();
  return {
    ...actual,
    assist: (...p: string[]) => path.join(tmp, ...p),
    dataDir: () => tmp,
    inData: (...p: string[]) => path.join(tmp, ...p),
    raw: (...p: string[]) => path.join(tmp, "raw", ...p),
  };
});

const { loadAiConfig, saveAiConfig, DEFAULT_STYLE, DEFAULT_ACTIVITY_SECTIONS } = await import(
  "../src/config.js"
);

beforeAll(() => {
  tmp = path.join(tmpdir(), `pauta-cfg-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(path.join(tmp, "config"), { recursive: true });
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const configFile = () => path.join(tmp, "config", "ai-config.json");

describe("loadAiConfig", () => {
  it("retorna defaults quando não existe arquivo", () => {
    rmSync(configFile(), { force: true });
    const cfg = loadAiConfig();
    expect(cfg.model).toBe("gpt-4o");
    expect(cfg.provider).toBe("openai");
    expect(cfg.style).toEqual(DEFAULT_STYLE);
    expect(cfg.activitySections).toEqual(DEFAULT_ACTIVITY_SECTIONS);
  });

  it("mescla arquivo parcial sobre os defaults (níveis aninhados inclusos)", () => {
    writeFileSync(
      configFile(),
      JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        style: { noIntroOutro: false, extraRules: "- Regra extra de teste." },
        activitySections: { arquivos: false },
      }),
      "utf-8",
    );
    const cfg = loadAiConfig();
    expect(cfg.model).toBe("gpt-4o-mini");
    expect(cfg.temperature).toBe(0.2);
    expect(cfg.style.persona).toBe(DEFAULT_STYLE.persona);
    expect(cfg.style.noIntroOutro).toBe(false);
    expect(cfg.style.extraRules).toBe("- Regra extra de teste.");
    expect(cfg.activitySections.arquivos).toBe(false);
    expect(cfg.activitySections.questoes).toBe(true);
  });

  it("ignora campos legacy sem quebrar o carregamento", () => {
    writeFileSync(
      configFile(),
      JSON.stringify({
        model: "gpt-4o",
        message_template: "template antigo",
        activity_template: "scaffold antigo",
        system_prompt: "prompt antigo",
      }),
      "utf-8",
    );
    const cfg = loadAiConfig();
    expect(cfg.model).toBe("gpt-4o");
    expect(cfg.style).toEqual(DEFAULT_STYLE);
  });

  it("JSON corrompido cai nos defaults", () => {
    writeFileSync(configFile(), "{ isto não é json", "utf-8");
    const cfg = loadAiConfig();
    expect(cfg.model).toBe("gpt-4o");
    expect(cfg.style).toEqual(DEFAULT_STYLE);
  });
});

describe("saveAiConfig", () => {
  it("salva e relê a config sem perda", () => {
    const cfg = loadAiConfig();
    cfg.model = "gpt-4.1-mini";
    cfg.temperature = 0.3;
    saveAiConfig(cfg);
    const reloaded = loadAiConfig();
    expect(reloaded.model).toBe("gpt-4.1-mini");
    expect(reloaded.temperature).toBe(0.3);
  });
});
