// Renders the app icons used when the LXP Toolkit is installed/saved as a
// browser shortcut (home screen, pinned tab, desktop PWA).
//
//   npm run app:icons
//
// The mark mirrors `apps/web/public/favicon.svg` / `BrandMark` ("Stacked X":
// an ink tile with two offset diagonals). Platform rules:
//   - `icon-*.png` are full-bleed squares; Android/Chrome mask them.
//   - `icon-maskable-512.png` keeps the mark inside the 80% safe zone.
//   - `apple-touch-icon.png` is opaque (iOS puts black behind transparency).
//   - `favicon.ico` keeps the rounded tile with transparent corners (tab/pin).
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "apps", "web", "public");

const INK = "#131211";
const PAPER = "#FAFAFA";

/** The Stacked X, drawn on a 64-unit canvas. `inset` shrinks it around center. */
function mark(inset = 0, opacity = 0.42) {
  const s = 1 - inset / 32;
  const t = `translate(32 32) scale(${s}) translate(-32 -32)`;
  return `
    <g transform="${t}">
      <g stroke="${PAPER}" stroke-width="7" stroke-linecap="round" opacity="${opacity}" transform="translate(2.5 2.5)">
        <line x1="20" y1="20" x2="44" y2="44"/>
        <line x1="44" y1="20" x2="20" y2="44"/>
      </g>
      <g stroke="${PAPER}" stroke-width="7" stroke-linecap="round">
        <line x1="20" y1="20" x2="44" y2="44"/>
        <line x1="44" y1="20" x2="20" y2="44"/>
      </g>
    </g>`;
}

function svg(size, { rounded = false, inset = 0 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <rect width="64" height="64" ${rounded ? 'rx="15"' : ""} fill="${INK}"/>
  ${mark(inset)}
</svg>`;
}

/** ICO container wrapping a single PNG (Vista+ / all modern browsers). */
function icoFromPng(png, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0);
  entry.writeUInt8(size >= 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);
  return Buffer.concat([header, entry, png]);
}

function page(body) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; padding: 0; background: transparent; }
    svg { display: block; }
  </style></head><body>${body}</body></html>`;
}

const JOBS = [
  { file: "icon-192.png", size: 192, opts: {} },
  { file: "icon-512.png", size: 512, opts: {} },
  { file: "icon-maskable-512.png", size: 512, opts: { inset: 8 } },
  { file: "apple-touch-icon.png", size: 180, opts: {} },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  const tab = await browser.newPage({ deviceScaleFactor: 1 });
  for (const job of JOBS) {
    await tab.setViewportSize({ width: job.size, height: job.size });
    await tab.setContent(page(svg(job.size, job.opts)), { waitUntil: "load" });
    const target = path.join(OUT, job.file);
    await tab.screenshot({ path: target, omitBackground: true, type: "png" });
    console.log(`[app-icons] ${path.relative(ROOT, target)}`);
  }

  await tab.setViewportSize({ width: 32, height: 32 });
  await tab.setContent(page(svg(32, { rounded: true })), { waitUntil: "load" });
  const png = await tab.screenshot({ omitBackground: true, type: "png" });
  const ico = path.join(OUT, "favicon.ico");
  writeFileSync(ico, icoFromPng(png, 32));
  console.log(`[app-icons] ${path.relative(ROOT, ico)}`);
} finally {
  await browser.close();
}
