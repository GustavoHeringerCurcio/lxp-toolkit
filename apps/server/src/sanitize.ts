/**
 * Sanitize the portal's activity HTML for display.
 *
 * The raw `html` field mixes real markup (`p`, `ul`, `strong`, …) with the
 * portal's custom elements (`grupoaattachment`, `grupoavideo`, …) and inline
 * attributes. We convert the custom widgets into plain markup, keep an
 * allowlist of presentational tags, unwrap everything else (keeping its text)
 * and drop dangerous blocks entirely. The client renders the result by walking
 * the DOM — it never injects HTML — so this is mostly about keeping the payload
 * clean and predictable.
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
  "span", "div", "img",
  "table", "thead", "tbody", "tr", "th", "td",
]);

const VOID_TAGS = new Set(["br", "hr", "img"]);

const SAFE_HREF = /^(https?:|mailto:|\/|#)/i;

/** Read an attribute value from a raw tag's attribute string. */
function attr(attrs: string, name: string): string {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return (m?.[1] ?? m?.[2] ?? m?.[3] ?? "").trim();
}

/** Escape a value for safe interpolation into an HTML attribute / text node. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Strip tags from widget inner content, keeping the readable text. */
function innerText(inner: string): string {
  return inner.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Map a portal custom element to plain markup:
 *   attachment/book → download link · link → anchor · video → link · layout → img.
 * Unknown widgets are unwrapped (their text survives).
 */
function widget(name: string, attrs: string, inner: string): string {
  const file = attr(attrs, "file");
  const filename = attr(attrs, "filename");
  const href = attr(attrs, "href");
  const text = attr(attrs, "text");
  const url = attr(attrs, "url");
  const banner = attr(attrs, "banner");
  const inner_ = innerText(inner);

  switch (name) {
    case "attachment":
    case "book": {
      if (!SAFE_HREF.test(file)) return inner;
      const label = filename || inner_ || file;
      return `<a href="${esc(file)}">${esc(label)}</a>`;
    }
    case "link": {
      if (!SAFE_HREF.test(href)) return inner;
      return `<a href="${esc(href)}">${esc(text || inner_ || href)}</a>`;
    }
    case "video": {
      if (!SAFE_HREF.test(url)) return inner;
      return `<a href="${esc(url)}">${esc(url)}</a>`;
    }
    case "layout": {
      if (!SAFE_HREF.test(banner)) return "";
      return `<img src="${esc(banner)}" alt="${esc(attr(attrs, "bannername"))}">`;
    }
    default:
      return inner;
  }
}

/** Replace every `<grupoa*>` widget (paired or self-closing) with plain markup. */
export function transformWidgets(html: string): string {
  return html
    .replace(/<grupoa([a-z]+)\b([^>]*)>([\s\S]*?)<\/grupoa\1>/gi, (_m, name: string, attrs: string, inner: string) =>
      widget(name.toLowerCase(), attrs, inner),
    )
    .replace(/<grupoa([a-z]+)\b([^>]*?)\/?>/gi, (_m, name: string, attrs: string) =>
      widget(name.toLowerCase(), attrs, ""),
    );
}

/** Remove whole dangerous blocks (script/style/iframe/…), comments and doctypes. */
export function stripDangerousHtml(html: string): string {
  return DANGEROUS_BLOCKS.reduce((acc, re) => acc.replace(re, ""), html);
}

/** Keep only safe `href` values, quoting them for the output. */
function safeHref(tag: string): string {
  const href = attr(tag, "href");
  return SAFE_HREF.test(href) ? href.replace(/"/g, "&quot;") : "";
}

/** Preserve `text-align` from the portal's inline style as a `data-align` hook. */
function alignOf(tag: string): string {
  const m = tag.match(/text-align\s*:\s*(justify|center|right)/i);
  return m ? ` data-align="${m[1].toLowerCase()}"` : "";
}

/**
 * Return a cleaned HTML string: dangerous blocks removed, widgets converted,
 * only allowlisted tags kept (attributes stripped, `a[href]`/`img[src]`
 * restricted to safe schemes), and any other tag unwrapped so its text survives.
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return "";
  const out = transformWidgets(stripDangerousHtml(html)).replace(
    /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g,
    (match, rawTag: string, selfClose: string) => {
      const tag = rawTag.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return "";
      if (match.startsWith("</")) return VOID_TAGS.has(tag) ? "" : `</${tag}>`;
      if (tag === "img") {
        const src = attr(match, "src");
        if (!SAFE_HREF.test(src)) return "";
        return `<img src="${src.replace(/"/g, "&quot;")}" alt="${attr(match, "alt").replace(/"/g, "&quot;")}">`;
      }
      if (tag === "a") {
        const href = safeHref(match);
        return href ? `<a href="${href}" target="_blank" rel="noreferrer">` : "<a>";
      }
      if (VOID_TAGS.has(tag)) return `<${tag}${selfClose ? "/" : ""}>`;
      return `<${tag}${alignOf(match)}>`;
    },
  );
  return out.replace(/\n{3,}/g, "\n\n").trim();
}
