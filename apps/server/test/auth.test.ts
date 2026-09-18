import type { IncomingMessage } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isAuthorized, presentedToken, toolkitToken } from "../src/auth.js";

/** Minimal IncomingMessage stub — the auth module only reads `headers`. */
function reqWith(headers: Record<string, string | undefined>): IncomingMessage {
  return { headers } as unknown as IncomingMessage;
}

const original = process.env.TOOLKIT_TOKEN;

describe("toolkitToken / isAuthorized", () => {
  beforeEach(() => {
    delete process.env.TOOLKIT_TOKEN;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.TOOLKIT_TOKEN;
    else process.env.TOOLKIT_TOKEN = original;
  });

  it("allows every request when no token is configured (local mode)", () => {
    expect(toolkitToken()).toBe("");
    expect(isAuthorized(reqWith({}))).toBe(true);
  });

  it("accepts a matching Authorization: Bearer token", () => {
    process.env.TOOLKIT_TOKEN = "s3cret";
    expect(isAuthorized(reqWith({ authorization: "Bearer s3cret" }))).toBe(true);
    expect(isAuthorized(reqWith({ authorization: "bearer s3cret" }))).toBe(true);
  });

  it("accepts a matching x-toolkit-token header", () => {
    process.env.TOOLKIT_TOKEN = "s3cret";
    expect(isAuthorized(reqWith({ "x-toolkit-token": "s3cret" }))).toBe(true);
  });

  it("rejects a wrong, missing or different-length token without throwing", () => {
    process.env.TOOLKIT_TOKEN = "s3cret";
    expect(isAuthorized(reqWith({}))).toBe(false);
    expect(isAuthorized(reqWith({ authorization: "Bearer nope" }))).toBe(false);
    expect(isAuthorized(reqWith({ authorization: "Bearer a-much-longer-token" }))).toBe(false);
    expect(isAuthorized(reqWith({ authorization: "s3cret" }))).toBe(false);
  });

  it("extracts the presented token from either header", () => {
    expect(presentedToken(reqWith({ authorization: "Bearer abc" }))).toBe("abc");
    expect(presentedToken(reqWith({ "x-toolkit-token": "def" }))).toBe("def");
    expect(presentedToken(reqWith({}))).toBe("");
  });
});
