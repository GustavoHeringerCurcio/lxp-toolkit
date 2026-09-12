import { describe, expect, it } from "vitest";
import { scorePct, verdictFor } from "@/lib/training";

describe("training helpers", () => {
  it("calcula a porcentagem de acertos", () => {
    expect(scorePct(15, 20)).toBe(75);
    expect(scorePct(0, 20)).toBe(0);
    expect(scorePct(0, 0)).toBe(0);
  });

  it("classifica o veredito de prontidão", () => {
    expect(verdictFor(90).key).toBe("training.readyHigh");
    expect(verdictFor(70).key).toBe("training.readyHigh");
    expect(verdictFor(55).key).toBe("training.readyMid");
    expect(verdictFor(49).key).toBe("training.readyLow");
    expect(verdictFor(0).key).toBe("training.readyLow");
  });
});
