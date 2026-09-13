/**
 * Sanitize the portal's activity HTML for display.
 *
 * The raw `html` field mixes real markup (`p`, `ul`, `strong`, …) with the
 * portal's custom elements (`grupoaattachment`, `grupoavideo`, …) and inline
 * attributes. We keep an allowlist of presentational tags, unwrap everything
 * else (keeping its text) and drop dangerous blocks entirely. The client renders
 * the result by walking the DOM — it never injects HTML — so this is mostly
 * about keeping the payload clean and predictable.
 */

const DANGEROUS_BLOCKS = [
  /<script\b[\s\S]*?<\/script>/gi,
  /<style\b[\s\S]*?<\/style>/gi,
  /<iframe\b[\s\S]*?<\/iframe>/gi,
  /<object\b[\s\S]*?<\/object>/gi,
  /<embed\b[^>]*>/gi,
  /<noscript\b[\s\S]*?<\/noscript>/gi,
  /<template\b[\s\S]*?<\/template>/gi,
  /<!--[\s\S]*?-->/g,
  /<![^>]*>/g,
];

const ALLOWED_TAGS = new Set([
  "p", "br", "hr",
  "strong", "b", "em", "i", "u", "s",
  "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "blockquote", "code", "pre", "a",
  "span", "div",
  "table", "thead", "tbody", "tr", "th", "td",
]);

const VOID_TAGS = new Set(["br", "hr"]);

const SAFE_HREF = /^(https?:|mailto:|\/|#)/i;

/** Remove whole dangerous blocks (script/style/iframe/…), comments and doctypes. */
export function stripDangerousHtml(html: string): string {
  return DANGEROUS_BLOCKS.reduce((acc, re) => acc.replace(re, ""), html);
}

function safeHref(tag: string): string {
  const m = tag.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const href = (m?.[1] ?? m?.[2] ?? m?.[3] ?? "").trim();
  return SAFE_HREF.test(href) ? href.replace(/"/g, "&quot;") : "";
}

/**
 * Return a cleaned HTML string: dangerous blocks removed, only allowlisted tags
 * kept (attributes stripped, `a[href]` restricted to safe schemes), and any
 * other tag unwrapped so its text survives.
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return "";
  const out = stripDangerousHtml(html).replace(
    /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g,
    (match, rawTag: string, selfClose: string) => {
      const tag = rawTag.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return "";
      if (VOID_TAGS.has(tag)) return `<${tag}${selfClose ? "/" : ""}>`;
      if (match.startsWith("</")) return `</${tag}>`;
      if (tag === "a") {
        const href = safeHref(match);
        return href ? `<a href="${href}" target="_blank" rel="noreferrer">` : "<a>";
      }
      return `<${tag}>`;
    },
  );
  return out.replace(/\n{3,}/g, "\n\n").trim();
}
