#!/usr/bin/env node
// Extract the platform's self-published endpoint catalog.
//
// The LXP identity payload (`GET /v2/safea-client/users/me`) ships a `features[]`
// manifest: every SPA action mapped to its alias, HTTP method, endpoint path and
// web route. This script normalizes that manifest into a stable, AI-readable
// artifact (`agent-docs/endpoint-catalog.json`) so feature work starts from the
// real API surface instead of guesswork.
//
// Input:  a captured `api-calls.json` (from `npm run capture-api`), or any JSON
//         whose shape contains a response body with `features[]`.
// Output: `agent-docs/endpoint-catalog.json` (metadata + normalized features).
//
// Usage:
//   node scripts/endpoint-catalog.mjs [input.json] [output.json]
//
// Notes:
// - The manifest is platform metadata (aliases + paths), not personal data. The
//   `users/me` payload DOES contain personal fields; this script only reads
//   `features[]`, so nothing personal is copied into the output.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inFile = process.argv[2] ?? path.join(ROOT, "scraped", "raw", "api-calls.json");
const outFile = process.argv[3] ?? path.join(ROOT, "agent-docs", "endpoint-catalog.json");

/** Deep-walk any JSON value looking for the first object that has a `features[]`. */
function findManifest(value, depth = 0) {
  if (value == null || depth > 12) return null;
  // Response bodies are often JSON encoded as a string — try to parse them.
  if (typeof value === "string") {
    const s = value.trim();
    if (!s.startsWith("{") && !s.startsWith("[")) return null;
    try {
      return findManifest(JSON.parse(s), depth + 1);
    } catch {
      return null;
    }
  }
  if (typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findManifest(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (Array.isArray(value.features) && value.features.length > 0) return value.features;
  for (const child of Object.values(value)) {
    const found = findManifest(child, depth + 1);
    if (found) return found;
  }
  return null;
}

function readFeatures(file) {
  if (!existsSync(file)) {
    throw new Error(`Input not found: ${file}. Run 'npm run capture-api' first.`);
  }
  const raw = JSON.parse(readFileSync(file, "utf-8"));
  const features = findManifest(raw);
  if (!features) throw new Error(`No 'features[]' manifest found in ${file}.`);
  return features;
}

/** Coarse domain bucket from the endpoint path (fallback: the alias). */
function domainOf(endpoint, alias) {
  const p = endpoint || "";
  if (p.startsWith("/wc/")) return "academic-services";
  if (p.includes("/safea-client")) return "identity";
  if (p.includes("/notification-service")) return "notifications";
  if (p.startsWith("/widget")) return "widgets";
  if (p.includes("/message/") || p.includes("/academic/messages")) return "messages";
  if (p.includes("/academic/notices") || p.includes("/notices-board")) return "notices";
  if (p.includes("/academic/calendar") || p.includes("/calendar/")) return "calendar";
  if (p.includes("/academic/achievements")) return "achievements";
  if (p.includes("/academic/surveys")) return "surveys";
  if (p.includes("/academic/academics-main") || p.includes("/groupset/")) return "groups";
  if (p.includes("/academic/courses") || p.includes("/academic/me/category")) return "courses";
  if (p.includes("/plataforma/grades") || p.includes("/grades/")) return "grades";
  if (p.includes("/plataforma/content") || p.includes("/content/")) return "content";
  if (p.includes("/settings/")) return "settings";
  if (p.includes("/users/")) return "users";
  if (p.includes("/academic/")) return "academic";
  if (p.startsWith("/v")) return "other-api";
  return "web";
}

/** Student-facing read/write label. GET/HEAD = read; everything else = write. */
function accessOf(method) {
  const m = String(method || "").toUpperCase();
  if (m === "GET" || m === "HEAD") return "read";
  if (!m) return "unknown";
  return "write";
}

const features = readFeatures(inFile);

const normalized = features
  .map((f) => ({
    alias: f.alias ?? null,
    description: f.description ?? null,
    method: f.httpMethod ?? null,
    endpoint: f.endpoint ?? null,
    webRoute: f.webRoute ?? null,
    applicationId: f.applicationId ?? null,
    menuPosition: f.menuPosition ?? null,
    menuVisibility: f.menuVisibility ?? null,
    icon: f.icon ?? null,
    status: f.status ?? null,
  }))
  .map((f) => ({
    ...f,
    domain: domainOf(f.endpoint, f.alias),
    access: accessOf(f.method),
  }))
  .sort((a, b) => (a.domain + a.endpoint + a.alias).localeCompare(b.domain + b.endpoint + b.alias));

const byDomain = {};
const byAccess = { read: 0, write: 0, unknown: 0 };
for (const f of normalized) {
  byDomain[f.domain] = (byDomain[f.domain] ?? 0) + 1;
  byAccess[f.access] = (byAccess[f.access] ?? 0) + 1;
}

const out = {
  $schema: "lxp-endpoint-catalog/v1",
  generatedAt: new Date().toISOString(),
  source: path.relative(ROOT, inFile),
  counts: {
    total: normalized.length,
    byDomain,
    byAccess,
  },
  features: normalized,
};

writeFileSync(outFile, JSON.stringify(out, null, 2) + "\n", "utf-8");

console.log(
  `endpoint catalog → ${path.relative(ROOT, outFile)}\n` +
    `  ${normalized.length} features · ${byAccess.read} read · ${byAccess.write} write · ${byAccess.unknown} unknown\n` +
    `  domains: ${Object.entries(byDomain)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}(${v})`)
      .join(", ")}`,
);
