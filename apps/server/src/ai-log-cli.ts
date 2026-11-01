/**
 * Read the local AI generation logs.
 *
 *   npm run ai:log -- --item 89612062
 *   npm run ai:log -- --bad --limit 10
 *   npm run ai:log
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { aiLogDir } from "./ai-log.js";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? "") : null;
}

function latestItem(id: string): void {
  const file = path.join(aiLogDir(), "latest", `item-${id}.json`);
  if (!existsSync(file)) {
    console.error(`Nenhum log para o item ${id}. Caminho: ${file}`);
    process.exitCode = 1;
    return;
  }
  console.log(readFileSync(file, "utf-8"));
}

function recentBad(limit: number): void {
  const dir = aiLogDir();
  if (!existsSync(dir)) {
    console.error(`Nenhum log em ${dir}`);
    return;
  }
  const files = readdirSync(dir)
    .filter((n) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(n))
    .sort()
    .reverse();
  const out: unknown[] = [];
  for (const name of files) {
    const lines = readFileSync(path.join(dir, name), "utf-8").split("\n").filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const rec = JSON.parse(lines[i]) as { gate?: { verdict?: string } };
        if (rec.gate?.verdict === "bad" || rec.gate?.verdict === "terrible") out.push(rec);
      } catch {
        /* skip malformed line */
      }
      if (out.length >= limit) break;
    }
    if (out.length >= limit) break;
  }
  console.log(JSON.stringify(out, null, 2));
}

function listLatest(): void {
  const dir = path.join(aiLogDir(), "latest");
  if (!existsSync(dir)) {
    console.error(`Nenhum log em ${dir}`);
    return;
  }
  const files = readdirSync(dir)
    .map((name) => ({ name, at: statSync(path.join(dir, name)).mtimeMs }))
    .sort((a, b) => b.at - a.at);
  for (const f of files) console.log(path.join(dir, f.name));
}

const item = arg("item");
if (item) latestItem(item);
else if (process.argv.includes("--bad")) recentBad(Number(arg("limit") ?? 10) || 10);
else listLatest();
