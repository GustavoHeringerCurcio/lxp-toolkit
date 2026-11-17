import { afterEach, describe, expect, it } from "vitest";
import { getAppLink, tailnetOrigin } from "../src/app-link.js";

const original = process.env.LXP_PUBLIC_URL;

afterEach(() => {
  if (original === undefined) delete process.env.LXP_PUBLIC_URL;
  else process.env.LXP_PUBLIC_URL = original;
});

describe("app link", () => {
  it("rejects origins that are not Tailscale names", () => {
    expect(tailnetOrigin("https://example.com")).toBeNull();
    expect(tailnetOrigin("http://localhost:4174")).toBeNull();
    expect(tailnetOrigin("not a url")).toBeNull();
  });

  it("normalizes a reported ts.net origin to its bare origin", () => {
    expect(tailnetOrigin("https://node.tailnet.ts.net/some/path")).toBe(
      "https://node.tailnet.ts.net",
    );
  });

  it("prefers the explicit LXP_PUBLIC_URL override", () => {
    process.env.LXP_PUBLIC_URL = "https://node.tailnet.ts.net/";
    expect(getAppLink()).toEqual({ url: "https://node.tailnet.ts.net", source: "env" });
  });

  it("ignores an invalid LXP_PUBLIC_URL", () => {
    process.env.LXP_PUBLIC_URL = "javascript:alert(1)";
    expect(getAppLink().source).not.toBe("env");
  });
});
