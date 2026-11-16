// Renders the Bark notification art (icon + expanded banner) as PNGs.
//
//   npm run notif:icons
//
// Bark downloads `icon` (small avatar, masked to a circle by iOS) and `image`
// (attachment shown when the notification is expanded) from a public URL, so
// the files live in apps/web/public/notifications and are committed. Colors
// come from the status tokens in apps/web/src/index.css; the "soon" event uses
// ink on gold, matching the app's `soon` badge rule (gold never has white text).
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "apps", "web", "public", "notifications");

const INK = "#131211";
const PAPER = "#FAFAFA";

const GLYPHS = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  mark: [
    '<g opacity="0.42" transform="translate(0.9 0.9)">',
    '<path d="M7.5 7.5 16.5 16.5"/><path d="M16.5 7.5 7.5 16.5"/>',
    "</g>",
    '<path d="M7.5 7.5 16.5 16.5"/><path d="M16.5 7.5 7.5 16.5"/>',
  ].join(""),
};

const EVENTS = {
  done: { bg: "oklch(0.527 0.137 150.1)", fg: "#FFFFFF", glyph: "check" },
  expired: { bg: "oklch(0.577 0.215 27.3)", fg: "#FFFFFF", glyph: "x" },
  new: { bg: "oklch(0.551 0.181 255.7)", fg: "#FFFFFF", glyph: "bell" },
  "due-soon": { bg: "oklch(0.681 0.142 75.8)", fg: INK, glyph: "clock" },
  test: { bg: INK, fg: PAPER, glyph: "mark" },
};

/** 24-unit glyph centered on a square canvas, scaled to `size` px. */
function glyphMarkup(glyph, size, centerX, centerY, fg) {
  const scale = size / 24;
  const x = centerX - size / 2;
  const y = centerY - size / 2;
  return `<g transform="translate(${x} ${y}) scale(${scale})" fill="none" stroke="${fg}"
      stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[glyph]}</g>`;
}

function iconSvg({ bg, fg, glyph }, size = 512) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${bg}"/>
  <rect width="${size}" height="${size}" fill="url(#glow)"/>
  <defs>
    <radialGradient id="glow" cx="30%" cy="18%" r="80%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
  </defs>
  ${glyphMarkup(glyph, size * 0.5, size / 2, size / 2, fg)}
</svg>`;
}

function bannerSvg({ bg, fg, glyph }, width = 1200, height = 600) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${bg}"/>
  <rect width="${width}" height="${height}" fill="url(#glow)"/>
  <defs>
    <radialGradient id="glow" cx="22%" cy="10%" r="90%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
  </defs>
  ${glyphMarkup(glyph, 300, width / 2, height / 2, fg)}
</svg>`;
}

function page(body) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; padding: 0; background: transparent; }
    svg { display: block; }
  </style></head><body>${body}</body></html>`;
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  const tab = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [name, event] of Object.entries(EVENTS)) {
    const jobs = [
      { file: `${name}.png`, svg: iconSvg(event), width: 512, height: 512 },
      { file: `${name}-banner.png`, svg: bannerSvg(event), width: 1200, height: 600 },
    ];
    for (const job of jobs) {
      await tab.setViewportSize({ width: job.width, height: job.height });
      await tab.setContent(page(job.svg), { waitUntil: "load" });
      const target = path.join(OUT, job.file);
      await tab.screenshot({ path: target, omitBackground: true, type: "png" });
      console.log(`[notif-icons] ${path.relative(ROOT, target)}`);
    }
  }
} finally {
  await browser.close();
}
