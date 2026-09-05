import { NodeHtmlMarkdown } from "node-html-markdown";

const converter = new NodeHtmlMarkdown({
  maxConsecutiveNewlines: 2,
  keepDataImages: false,
});

/**
 * Convert an HTML fragment (from the LXP content API) to Markdown.
 * Falls back to a stripped-text version if conversion fails.
 */
export function htmlToMarkdown(html: string | null | undefined): string {
  if (!html) return "";
  try {
    return converter.translate(html).trim();
  } catch {
    return stripTags(html);
  }
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Render a code/JSON block into Markdown. */
export function codeBlock(content: string, lang = "json"): string {
  return ["```" + lang, content, "```"].join("\n");
}

/** Escape a string for safe use in a markdown table cell. */
export function tableCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function heading(level: number, text: string): string {
  return `${"#".repeat(level)} ${text}\n`;
}

export function bullet(text: string): string {
  return `- ${text}`;
}
