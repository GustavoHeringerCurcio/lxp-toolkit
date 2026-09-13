import { Fragment, useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Render a sanitized HTML fragment (the activity brief) as real React elements.
 *
 * The string is parsed with the browser `DOMParser` and walked node by node;
 * only an allowlist of presentational tags is mapped, everything else is
 * unwrapped. No HTML is ever injected (`dangerouslySetInnerHTML`), so hostile
 * markup cannot execute. Falls back to the plain-text version when there is no
 * HTML.
 */

const SKIP_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "iframe",
  "object",
  "embed",
  "head",
  "svg",
  "math",
]);

const BLOCK_TAGS = new Set([
  "p",
  "div",
  "li",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
]);

const SAFE_HREF = /^(https?:|mailto:|\/|#)/i;

const HEADING_CLASS: Record<string, string> = {
  h1: "font-heading text-base font-semibold",
  h2: "font-heading text-base font-semibold",
  h3: "font-heading text-sm font-semibold",
  h4: "font-heading text-sm font-semibold",
  h5: "font-heading text-sm font-semibold",
  h6: "font-heading text-sm font-semibold",
};

/** Portal inline `text-align` is preserved by the sanitizer as `data-align`. */
function alignClass(el: Element): string {
  const align = el.getAttribute("data-align");
  if (align === "justify") return "text-justify";
  if (align === "center") return "text-center";
  if (align === "right") return "text-right";
  return "";
}

function renderNode(node: Node, key: string): ReactNode {
  if (node.nodeType === 3) {
    const text = node.textContent ?? "";
    return text ? text : null;
  }
  if (node.nodeType !== 1) return null;

  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (SKIP_TAGS.has(tag)) return null;

  const children = Array.from(el.childNodes)
    .map((child, i) => renderNode(child, `${key}-${i}`))
    .filter((child) => child !== null && child !== false);

  if (tag === "br") return <br key={key} />;
  if (tag === "hr") return <hr key={key} className="border-border" />;

  // Drop empty block wrappers (the portal emits a trailing `<p></p>` per widget).
  if (BLOCK_TAGS.has(tag)) {
    const hasVisible = children.some((child) => typeof child !== "string" || child.trim() !== "");
    if (!hasVisible) return null;
  }

  const headingClass = HEADING_CLASS[tag];
  if (headingClass) {
    return (
      <p key={key} className={cn(headingClass, alignClass(el))}>
        {children}
      </p>
    );
  }

  switch (tag) {
    case "p":
      return (
        <p key={key} className={cn(alignClass(el))}>
          {children}
        </p>
      );
    case "div":
      return (
        <div key={key} className={cn(alignClass(el))}>
          {children}
        </div>
      );
    case "strong":
    case "b":
      return (
        <strong key={key} className="font-semibold">
          {children}
        </strong>
      );
    case "em":
    case "i":
      return <em key={key}>{children}</em>;
    case "u":
      return <u key={key}>{children}</u>;
    case "s":
      return <s key={key}>{children}</s>;
    case "ul":
      return (
        <ul key={key} className="list-disc space-y-1 pl-5">
          {children}
        </ul>
      );
    case "ol":
      return (
        <ol key={key} className="list-decimal space-y-1 pl-5">
          {children}
        </ol>
      );
    case "li":
      return <li key={key}>{children}</li>;
    case "blockquote":
      return (
        <blockquote key={key} className={cn("border-l-2 border-border pl-3 text-muted-foreground", alignClass(el))}>
          {children}
        </blockquote>
      );
    case "code":
      return (
        <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
          {children}
        </code>
      );
    case "pre":
      return (
        <pre key={key} className="overflow-x-auto rounded-lg bg-muted/40 p-3 text-xs">
          {children}
        </pre>
      );
    case "img": {
      const src = el.getAttribute("src") ?? "";
      if (!SAFE_HREF.test(src)) return null;
      return (
        <img
          key={key}
          src={src}
          alt={el.getAttribute("alt") ?? ""}
          loading="lazy"
          className="max-w-full rounded-lg border border-border"
        />
      );
    }
    case "a": {
      const href = el.getAttribute("href") ?? "";
      if (!SAFE_HREF.test(href)) return <span key={key}>{children}</span>;
      return (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-brand underline underline-offset-4"
        >
          {children}
        </a>
      );
    }
    case "table":
      return (
        <table key={key} className="w-full border-collapse text-sm">
          {children}
        </table>
      );
    case "thead":
      return <thead key={key}>{children}</thead>;
    case "tbody":
      return <tbody key={key}>{children}</tbody>;
    case "tr":
      return <tr key={key}>{children}</tr>;
    case "th":
      return (
        <th key={key} className="border border-border px-2 py-1 text-left font-semibold">
          {children}
        </th>
      );
    case "td":
      return (
        <td key={key} className="border border-border px-2 py-1">
          {children}
        </td>
      );
    default:
      return <Fragment key={key}>{children}</Fragment>;
  }
}

function parseHtml(html: string): ReactNode[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return Array.from(doc.body.childNodes)
    .map((node, i) => renderNode(node, `n${i}`))
    .filter((node) => node !== null && node !== false);
}

export function RichText({
  html,
  fallback,
  className,
}: {
  html?: string | null;
  fallback?: string | null;
  className?: string;
}) {
  const nodes = useMemo(() => {
    if (!html || !html.trim()) return null;
    try {
      return parseHtml(html);
    } catch {
      return null;
    }
  }, [html]);

  if (!nodes || nodes.length === 0) {
    if (!fallback || !fallback.trim()) return null;
    return (
      <p className={cn("whitespace-pre-wrap text-sm leading-relaxed text-foreground/90", className)}>
        {fallback}
      </p>
    );
  }

  return (
    <div className={cn("space-y-3 text-sm leading-relaxed text-foreground/90", className)}>{nodes}</div>
  );
}
