import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Minimal, dependency-free markdown renderer for AI-generated prose (the
 * Resumo). Deliberately small: headings, bullet/ordered lists, blockquotes,
 * fenced code, horizontal rules and inline bold/italic/code/links. Everything
 * is rendered as React elements — no HTML injection — so the model output can
 * never execute markup.
 *
 * It is not a full CommonMark implementation; it covers exactly what the
 * summary prompts ask the model to produce.
 */

const LINK_RE = /^\[([^\]]+)\]\(([^)\s]+)\)$/;
const SAFE_HREF = /^(https?:|mailto:|\/|#)/i;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  // **bold** | `code` | *italic* | _italic_ | [text](url)
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-i${i++}`;
    if (token.startsWith("**")) {
      out.push(
        <strong key={key} className="font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("`")) {
      out.push(
        <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("[")) {
      const link = LINK_RE.exec(token);
      if (link && SAFE_HREF.test(link[2])) {
        out.push(
          <a
            key={key}
            href={link[2]}
            target="_blank"
            rel="noreferrer"
            className="text-brand underline underline-offset-4"
          >
            {link[1]}
          </a>,
        );
      } else {
        out.push(token);
      }
    } else if (token.startsWith("_")) {
      out.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      out.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const HEADING_CLASS: Record<number, string> = {
  1: "font-heading text-xl font-semibold",
  2: "font-heading text-lg font-semibold",
  3: "font-heading text-base font-semibold",
  4: "font-heading text-sm font-semibold",
  5: "font-heading text-sm font-semibold",
  6: "font-heading text-sm font-semibold",
};

/**
 * The model sometimes wraps the whole answer in a ```markdown fence (more often
 * on the longer sizes). Rendering that as a code block is what makes a big
 * Resumo look like raw markdown, so unwrap a single outer fence first.
 */
export function stripOuterFence(content: string): string {
  const text = content.replace(/\r\n/g, "\n").trim();
  if (!text.startsWith("```")) return content;
  const lines = text.split("\n");
  if (!/^```[a-zA-Z0-9_-]*$/.test(lines[0].trim())) return content;
  if (lines[lines.length - 1].trim() !== "```") return content;
  const inner = lines.slice(1, -1).join("\n");
  if (inner.includes("```")) return content; // real multi-block content — keep
  return inner;
}

/** Drop leaked portal question ids ("Q36049942:", often inside bold). */
export function stripQuestionIds(content: string): string {
  return content
    .replace(/\*{0,2}\s*Q\d{4,}\b\s*[:.]?\s*\*{0,2}\s*/g, "")
    .replace(/\*{4,}/g, "");
}

interface RawListItem {
  indent: number;
  ordered: boolean;
  text: string;
}

interface ListItemNode {
  text: string;
  children: ListNode | null;
}

interface ListNode {
  ordered: boolean;
  items: ListItemNode[];
}

const LIST_RE = /^(\s*)([-*+•+]|\d+[.)])\s+(.*)$/;

function parseListTree(raw: RawListItem[], start: number, indent: number): { node: ListNode; next: number } {
  const ordered = raw[start].ordered;
  const node: ListNode = { ordered, items: [] };
  let i = start;
  while (i < raw.length) {
    const cur = raw[i];
    if (cur.indent < indent) break;
    if (cur.indent === indent && cur.ordered !== ordered) break;
    if (cur.indent > indent) break;
    const item: ListItemNode = { text: cur.text, children: null };
    node.items.push(item);
    i++;
    if (i < raw.length && raw[i].indent > indent) {
      const child = parseListTree(raw, i, raw[i].indent);
      item.children = child.node;
      i = child.next;
    }
  }
  return { node, next: i };
}

function renderList(node: ListNode, keyPrefix: string): ReactNode {
  const items = node.items.map((item, i) => (
    <li key={i}>
      {renderInline(item.text, `${keyPrefix}-${i}`)}
      {item.children && renderList(item.children, `${keyPrefix}-${i}c`)}
    </li>
  ));
  return node.ordered ? (
    <ol key={keyPrefix} className="list-decimal space-y-1 pl-5">
      {items}
    </ol>
  ) : (
    <ul key={keyPrefix} className="list-disc space-y-1 pl-5">
      {items}
    </ul>
  );
}

/** Parse the summary markdown into React elements. */
export function parseMarkdown(content: string): ReactNode[] {
  const lines = stripQuestionIds(stripOuterFence(content)).replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  const nextKey = () => `md-${key++}`;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    // Fenced code block
    if (/^\s*```/.test(line)) {
      const lang = line.trim().slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
      i++; // closing fence
      blocks.push(
        <pre
          key={nextKey()}
          className="overflow-x-auto rounded-lg bg-muted/40 p-3 text-xs"
          data-lang={lang || undefined}
        >
          <code>{body.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // Horizontal rule
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push(<hr key={nextKey()} className="border-border" />);
      i++;
      continue;
    }

    // Heading
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      blocks.push(
        <p key={nextKey()} className={cn("mt-1 text-balance", HEADING_CLASS[level])}>
          {renderInline(heading[2].trim(), nextKey())}
        </p>,
      );
      i++;
      continue;
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote key={nextKey()} className="border-l-2 border-border pl-3 text-muted-foreground">
          {renderInline(body.join(" "), nextKey())}
        </blockquote>,
      );
      continue;
    }

    // List (unordered/ordered, nested by indentation; tolerate blank lines).
    if (LIST_RE.test(line)) {
      const raw: RawListItem[] = [];
      while (i < lines.length) {
        const lm = LIST_RE.exec(lines[i]);
        if (lm) {
          raw.push({
            indent: Math.floor(lm[1].replace(/\t/g, "  ").length / 2),
            ordered: /\d/.test(lm[2]),
            text: lm[3].trim(),
          });
          i++;
          continue;
        }
        if (/^\s*$/.test(lines[i])) {
          let j = i + 1;
          while (j < lines.length && /^\s*$/.test(lines[j])) j++;
          if (j < lines.length && LIST_RE.test(lines[j])) {
            i = j;
            continue;
          }
        }
        break;
      }
      let idx = 0;
      while (idx < raw.length) {
        const { node, next } = parseListTree(raw, idx, raw[idx].indent);
        blocks.push(renderList(node, nextKey()));
        if (next <= idx) break; // safety against a malformed list
        idx = next;
      }
      continue;
    }

    // Paragraph: gather until a blank line or the start of another block.
    const para: string[] = [line];
    i++;
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^\s*```/.test(lines[i]) &&
      !/^#{1,6}\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={nextKey()}>{renderInline(para.join(" "), nextKey())}</p>,
    );
  }

  return blocks;
}

export function Markdown({ content, className }: { content: string; className?: string }) {
  const blocks = parseMarkdown(content ?? "");
  if (blocks.length === 0) return null;
  return (
    <div className={cn("space-y-3 text-sm leading-relaxed text-foreground/90", className)}>{blocks}</div>
  );
}
