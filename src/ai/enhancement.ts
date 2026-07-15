import type { MarkdownFlowBlockType } from "./protocol";

export type MarkdownFlowEnhancementMode = "off" | "safe" | "aggressive";

export interface MarkdownFlowEnhancement {
  type: Extract<MarkdownFlowBlockType, "checklist" | "filetree" | "metrics" | "progress" | "timeline">;
  confidence: number;
  originalMarkdown: string;
  enhancedMarkdown: string;
  sourceRange: { start: number; end: number };
}

export interface MarkdownFlowEnhancementResult {
  /** Content to pass to the existing Markdown Flow parser. */
  content: string;
  /** The untouched input. Callers can always restore it if enhanced rendering fails. */
  originalMarkdown: string;
  mode: MarkdownFlowEnhancementMode;
  enhanced: boolean;
  transformations: readonly MarkdownFlowEnhancement[];
}

export interface MarkdownFlowEnhancementOptions {
  mode?: MarkdownFlowEnhancementMode;
}

type Candidate = Omit<MarkdownFlowEnhancement, "sourceRange"> & { lineCount: number };

const fenceStart = /^\s*```([^\s`]*)/;
const fenceEnd = /^\s*```\s*$/;
const taskItem = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.+?)\s*$/;
const datedItem = /^\s*(?:[-*+]\s+|\d+[.)]\s+)(\d{4}-\d{2}-\d{2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,\s*\d{4})?)\s*(?:[-–—:]\s*)?(.+?)\s*$/i;
const tableSeparatorCell = /^:?-{3,}:?$/;

/**
 * Progressively enhances only recognizable, presentation-oriented Markdown.
 * The operation is pure, deterministic, and keeps every replaced source range
 * in `transformations`, allowing a renderer to fall back to the exact input.
 */
export function enhanceMarkdownFlowContent(
  markdown: string,
  options: MarkdownFlowEnhancementOptions | MarkdownFlowEnhancementMode = {},
): MarkdownFlowEnhancementResult {
  const mode = typeof options === "string" ? options : options.mode ?? "safe";
  if (mode === "off" || !markdown) return unchanged(markdown, mode);

  const lines = markdown.match(/.*(?:\n|$)/g)?.filter(Boolean) ?? [];
  const offsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length;
  }

  const output: string[] = [];
  const transformations: MarkdownFlowEnhancement[] = [];
  for (let index = 0; index < lines.length;) {
    const fence = fenceStart.exec(stripNewline(lines[index]));
    if (fence) {
      const end = findFenceEnd(lines, index + 1);
      if (end !== -1) {
        const candidate = createFileTreeCandidate(lines, index, end, fence[1], mode);
        if (candidate) {
          appendCandidate(candidate, index, offsets, output, transformations);
          index += candidate.lineCount;
          continue;
        }
        output.push(...lines.slice(index, end + 1));
        index = end + 1;
        continue;
      }
      output.push(...lines.slice(index));
      break;
    }

    const candidate = createTaskCandidate(lines, index, mode)
      ?? createDatedListCandidate(lines, index, mode)
      ?? createTableCandidate(lines, index, mode);
    if (candidate) {
      appendCandidate(candidate, index, offsets, output, transformations);
      index += candidate.lineCount;
      continue;
    }
    output.push(lines[index]);
    index += 1;
  }

  return {
    content: output.join(""),
    originalMarkdown: markdown,
    mode,
    enhanced: transformations.length > 0,
    transformations,
  };
}

/** A convenient content-only adapter for preprocessing an AIResponse value. */
export function applyMarkdownFlowEnhancements(
  markdown: string,
  mode: MarkdownFlowEnhancementMode = "safe",
): string {
  return enhanceMarkdownFlowContent(markdown, mode).content;
}

function unchanged(markdown: string, mode: MarkdownFlowEnhancementMode): MarkdownFlowEnhancementResult {
  return { content: markdown, originalMarkdown: markdown, mode, enhanced: false, transformations: [] };
}

function appendCandidate(
  candidate: Candidate,
  lineIndex: number,
  offsets: readonly number[],
  output: string[],
  transformations: MarkdownFlowEnhancement[],
): void {
  output.push(candidate.enhancedMarkdown);
  transformations.push({
    type: candidate.type,
    confidence: candidate.confidence,
    originalMarkdown: candidate.originalMarkdown,
    enhancedMarkdown: candidate.enhancedMarkdown,
    sourceRange: {
      start: offsets[lineIndex] ?? 0,
      end: (offsets[lineIndex] ?? 0) + candidate.originalMarkdown.length,
    },
  });
}

function createTaskCandidate(lines: readonly string[], start: number, mode: Exclude<MarkdownFlowEnhancementMode, "off">): Candidate | undefined {
  const items: Array<{ title: string; checked: boolean }> = [];
  let end = start;
  while (end < lines.length) {
    const match = taskItem.exec(stripNewline(lines[end]));
    if (!match) break;
    items.push({ title: match[3], checked: match[2].toLowerCase() === "x" });
    end += 1;
  }
  if (items.length < (mode === "safe" ? 2 : 1)) return undefined;
  return blockCandidate("checklist", { items }, lines, start, end, mode === "safe" ? 0.99 : 0.94);
}

function createDatedListCandidate(lines: readonly string[], start: number, mode: Exclude<MarkdownFlowEnhancementMode, "off">): Candidate | undefined {
  const items: Array<{ date: string; title: string }> = [];
  let end = start;
  while (end < lines.length) {
    const match = datedItem.exec(stripNewline(lines[end]));
    if (!match) break;
    items.push({ date: match[1], title: match[2] });
    end += 1;
  }
  if (items.length < (mode === "safe" ? 2 : 1)) return undefined;
  return blockCandidate("timeline", { items }, lines, start, end, mode === "safe" ? 0.98 : 0.9);
}

function createTableCandidate(lines: readonly string[], start: number, mode: Exclude<MarkdownFlowEnhancementMode, "off">): Candidate | undefined {
  if (start + 2 >= lines.length) return undefined;
  const headers = parseTableRow(lines[start]);
  const separators = parseTableRow(lines[start + 1]);
  if (headers.length !== 2 || separators.length !== 2 || !separators.every((cell) => tableSeparatorCell.test(cell))) return undefined;

  const rows: string[][] = [];
  let end = start + 2;
  while (end < lines.length) {
    const row = parseTableRow(lines[end]);
    if (row.length !== 2) break;
    rows.push(row);
    end += 1;
  }
  if (rows.length < (mode === "safe" ? 2 : 1)) return undefined;

  const dateRows = rows.map(([date, title]) => ({ date, title }));
  if (dateRows.every((row) => isDate(row.date))) {
    return blockCandidate("timeline", { items: dateRows }, lines, start, end, mode === "safe" ? 0.98 : 0.9);
  }

  const numeric = rows.map(([label, value]) => ({ label, value, number: parseDisplayNumber(value) }));
  if (numeric.some((row) => row.number === undefined)) return undefined;
  const percentageHeader = /percent|progress|completion|complete|rate/i.test(headers[1]);
  const percentages = numeric.every((row) => /%\s*$/.test(row.value) && (row.number ?? -1) >= 0 && (row.number ?? 101) <= 100);
  if (percentages || percentageHeader && numeric.every((row) => (row.number ?? -1) >= 0 && (row.number ?? 101) <= 100)) {
    return blockCandidate("progress", {
      items: numeric.map((row) => ({ title: row.label, value: row.number, total: 100 })),
    }, lines, start, end, percentages ? 0.99 : 0.92);
  }

  const obviousValueHeader = /value|amount|count|total|metric|score|revenue|cost|users?/i.test(headers[1]);
  if (mode === "safe" && !obviousValueHeader) return undefined;
  return blockCandidate("metrics", {
    metrics: numeric.map((row) => ({ label: row.label, value: row.value })),
  }, lines, start, end, obviousValueHeader ? 0.97 : 0.86);
}

function createFileTreeCandidate(
  lines: readonly string[],
  start: number,
  end: number,
  language: string,
  mode: Exclude<MarkdownFlowEnhancementMode, "off">,
): Candidate | undefined {
  if (!["text", "plaintext", "tree", "files", ""].includes(language.toLowerCase())) return undefined;
  const body = lines.slice(start + 1, end).map(stripNewline).filter((line) => line.trim());
  const strongTreeLines = body.filter((line) => /[├└]──|│|\/$/.test(line));
  const pathLines = body.filter((line) => /^\s*(?:[\w@.-]+\/)+[\w@.-]+\/?\s*$/.test(line));
  const confident = strongTreeLines.length >= 2 || pathLines.length >= 2;
  if (!confident && mode === "safe") return undefined;
  if (!body.length || (!confident && !body.every((line) => /^\s{2,}[\w@.-]+\/?\s*$/.test(line)))) return undefined;

  const files = body.map((line) => {
    const treePrefix = line.match(/^[\s│]*(?:[├└]──\s*)?/u)?.[0] ?? "";
    const name = line.slice(treePrefix.length).trim();
    const depth = line.includes("──")
      ? Math.max(0, (treePrefix.match(/│| {4}/g) ?? []).length)
      : Math.max(0, Math.floor((line.length - line.trimStart().length) / 2));
    return { name: name.replace(/\/$/, ""), type: name.endsWith("/") ? "folder" : "file", depth };
  });
  return blockCandidate("filetree", { files }, lines, start, end + 1, confident ? 0.98 : 0.82);
}

function blockCandidate(
  type: Candidate["type"],
  config: unknown,
  lines: readonly string[],
  start: number,
  end: number,
  confidence: number,
): Candidate {
  const originalMarkdown = lines.slice(start, end).join("");
  const trailingNewline = originalMarkdown.endsWith("\n") ? "\n" : "";
  return {
    type,
    confidence,
    originalMarkdown,
    enhancedMarkdown: `\`\`\`${type}\n${JSON.stringify(config)}\n\`\`\`${trailingNewline}`,
    lineCount: end - start,
  };
}

function parseTableRow(line: string): string[] {
  const value = stripNewline(line).trim();
  if (!value.includes("|")) return [];
  const unwrapped = value.replace(/^\|/, "").replace(/\|$/, "");
  return unwrapped.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function parseDisplayNumber(value: string): number | undefined {
  const normalized = value.trim().replace(/[$€£¥,%\s]/g, "").replace(/,/g, "");
  if (!normalized || !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return undefined;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
}

function isDate(value: string): boolean {
  return /^(?:\d{4}-\d{2}-\d{2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,\s*\d{4})?)$/i.test(value.trim());
}

function findFenceEnd(lines: readonly string[], start: number): number {
  for (let index = start; index < lines.length; index += 1) {
    if (fenceEnd.test(stripNewline(lines[index]))) return index;
  }
  return -1;
}

function stripNewline(line: string): string {
  return line.endsWith("\n") ? line.slice(0, -1).replace(/\r$/, "") : line;
}
