import { writeFileSync } from "node:fs";
import path from "node:path";
import { createSession, closeSession } from "../src/session.js";
import { fetchCourses } from "../src/content.js";
import { config, logger } from "../src/config.js";
import { codeBlock, tableCell } from "../src/markdown.js";
import { ensureDir, json, resolveOut, sanitizeFilename, sleep } from "../src/util.js";

interface RouteCapture {
  url: string;
  title: string;
  headings: string[];
  text: string;
  links: string[];
  buttons: string[];
  inputs: { type: string; name: string }[];
  forms: { action: string; method: string }[];
}

// Router paths (relative to the SPA base /plataforma/). The dynamic course routes
// are appended in main() from the enrolled-courses list.
const SEED_PATHS = [
  "/",
  "/my-enrollments/courses",
  "/my-notices",
  "/messages",
  "/my-achievements",
  "/new-calendar",
  "/lti-tools",
  "/my-enrollments/communities",
];

/** Strip the SPA base so a path is usable as a router path. Returns null for external URLs. */
function toRouterPath(pathOrUrl: string): string | null {
  if (/^https?:\/\//.test(pathOrUrl)) {
    const u = new URL(pathOrUrl);
    if (!u.hostname.includes("grupoa.education")) return null;
    pathOrUrl = u.pathname;
  }
  const raw = pathOrUrl.split("?")[0];
  if (!raw || !raw.startsWith("/")) return null;
  const p = raw.startsWith("/plataforma") ? raw.slice("/plataforma".length) : raw;
  return p.startsWith("/") ? p : `/${p}`;
}

/** Client-side navigation (a full page.goto would reload and kill the SSO token). */
async function nav(page: import("playwright").Page, routerPath: string): Promise<void> {
  await page
    .evaluate((p) => {
      const w = window as unknown as { $nuxt?: { $router: { push(p: string): Promise<unknown> } } };
      return w.$nuxt?.$router.push(p);
    }, routerPath)
    .catch(() => {});
  await sleep(2500);
}

async function captureRoute(page: import("playwright").Page, routerPath: string): Promise<RouteCapture> {
  await nav(page, routerPath);
  return page.evaluate(function () {
    function q(sel: string): Element[] {
      return Array.from(document.querySelectorAll(sel));
    }
    function textOf(el: Element): string {
      return (el.textContent ?? "").trim();
    }
    return {
      url: location.href,
      title: document.title,
      headings: q("h1,h2,h3").map(textOf).filter(Boolean),
      text: (document.body?.innerText ?? "").slice(0, 50_000),
      links: q("a[href]")
        .map(function (el) {
          return el.getAttribute("href") ?? "";
        })
        .filter(function (h) {
          return h && !h.startsWith("#");
        }),
      buttons: q("button").map(textOf).filter(Boolean),
      inputs: q("input,textarea,select").map(function (el) {
        const e = el as HTMLInputElement;
        return { type: e.type || el.tagName.toLowerCase(), name: e.name || "" };
      }),
      forms: q("form").map(function (el) {
        const f = el as HTMLFormElement;
        return { action: f.action, method: f.method };
      }),
    };
  });
}

function routeFilename(route: string): string {
  const clean = route.replace(/^\/+/, "").replace(/\/$/, "") || "home";
  return `${sanitizeFilename(clean)}.md`;
}

function renderRouteMarkdown(cap: RouteCapture): string {
  const lines: string[] = [];
  lines.push(`# Route: ${cap.url}`);
  lines.push("");
  lines.push(`- **Title:** ${tableCell(cap.title)}`);
  lines.push("");
  if (cap.headings.length) {
    lines.push("## Headings");
    lines.push("");
    for (const h of cap.headings) lines.push(`- ${h}`);
    lines.push("");
  }
  if (cap.buttons.length) {
    lines.push("## Buttons / actions");
    lines.push("");
    for (const b of cap.buttons) lines.push(`- ${tableCell(b)}`);
    lines.push("");
  }
  if (cap.inputs.length) {
    lines.push("## Inputs");
    lines.push("");
    lines.push("| Type | Name |");
    lines.push("|---|---|");
    for (const i of cap.inputs) lines.push(`| ${tableCell(i.type)} | ${tableCell(i.name)} |`);
    lines.push("");
  }
  if (cap.forms.length) {
    lines.push("## Forms");
    lines.push("");
    for (const f of cap.forms) lines.push(`- action=\`${tableCell(f.action)}\` method=\`${tableCell(f.method)}\``);
    lines.push("");
  }
  if (cap.links.length) {
    lines.push("## Links");
    lines.push("");
    for (const l of cap.links) lines.push(`- \`${tableCell(l)}\``);
    lines.push("");
  }
  lines.push("## Page text");
  lines.push("");
  lines.push(codeBlock(cap.text, "text"));
  lines.push("");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const maxRoutes = (() => {
    const i = args.indexOf("--max");
    return i >= 0 ? Number(args[i + 1]) : 200;
  })();

  const session = await createSession();
  try {
    const routesDir = resolveOut(config.outDir, "routes");
    const rawDir = resolveOut(config.outDir, "raw");
    ensureDir(routesDir);
    ensureDir(rawDir);

    // Append dynamic course routes from the enrolled-courses list.
    let courses: { id: number; name: string }[] = [];
    try {
      courses = await fetchCourses(session.client);
    } catch (err) {
      logger.warn({ err }, "failed to enumerate courses for route crawl");
    }
    const paths = [...SEED_PATHS];
    for (const c of courses) {
      paths.push(`/course/${c.id}`);
      paths.push(`/my-grades/${c.id}`);
    }

    const captures: RouteCapture[] = [];
    const seen = new Set<string>();

    for (const p of paths) {
      const key = p;
      if (seen.has(key) || captures.length >= maxRoutes) continue;
      seen.add(key);

      logger.info({ path: p }, "capturing route");
      const cap = await captureRoute(session.page, p);
      captures.push(cap);

      for (const link of cap.links) {
        const rp = toRouterPath(link);
        if (rp && rp.startsWith("/") && !seen.has(rp)) paths.push(rp);
      }

      writeFileSync(path.join(routesDir, routeFilename(key)), renderRouteMarkdown(cap), "utf-8");
    }

    const index: string[] = ["# Portal route map (LXP)", "", `- Total routes captured: ${captures.length}`, ""];
    for (const cap of captures) {
      index.push(`- [${cap.title || cap.url}](${path.join("routes", routeFilename(toRouterPath(cap.url) ?? cap.url))}) — \`${cap.url}\``);
    }
    index.push("");
    writeFileSync(resolveOut(config.outDir, "portal-map.md"), index.join("\n"), "utf-8");
    writeFileSync(path.join(rawDir, "routes.json"), json(captures), "utf-8");

    console.log(`\nCaptured ${captures.length} route(s) → ${routesDir}`);
    console.log(`Index → ${resolveOut(config.outDir, "portal-map.md")}`);
  } finally {
    await closeSession(session);
  }
}

main().catch((err) => {
  logger.error({ err }, "crawl failed");
  console.error(err);
  process.exit(1);
});
