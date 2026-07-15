import { extractMarkdownFlowCitationIds } from "./citations";
import { normalizeMarkdownFlowContent, type MarkdownFlowNormalizationMode } from "./model";
import { normalizeMarkdownFlowBlock, validateMarkdownFlowBlock } from "./validation";

export interface MarkdownFlowDiagnosticsReport {
  markdownRendered: boolean;
  blocksDetected: number;
  blocksNormalized: number;
  blocksRendered: number;
  blocksFellBack: number;
  citationsMatched: number;
  citationsMissing: number;
}

export interface MarkdownFlowDiagnosticsOptions {
  sources?: readonly { id: string }[];
  normalization?: MarkdownFlowNormalizationMode;
  /** Override when the renderer knows the exact number of successful blocks. */
  blocksRendered?: number;
  /** Override when the renderer knows the exact number of readable fallbacks. */
  blocksFellBack?: number;
  /** Set false only when the host renderer itself failed to render Markdown. */
  markdownRendered?: boolean;
}

export interface MarkdownFlowNoBlocksDiagnostic {
  code: "no-rich-blocks";
  title: "No Markdown Flow blocks were detected.";
  message: "Ordinary Markdown rendered successfully. To request intentional rich blocks, add the compact Markdown Flow prompt to your model instructions.";
}

/** Calculates privacy-safe integration counters from content and render outcomes. */
export function createMarkdownFlowDiagnosticsReport(
  content: string,
  options: MarkdownFlowDiagnosticsOptions = {},
): MarkdownFlowDiagnosticsReport {
  const nodes = normalizeMarkdownFlowContent(content, { normalization: options.normalization });
  let blocksDetected = 0;
  let blocksNormalized = 0;
  let validBlocks = 0;

  for (const node of nodes) {
    if (node.type !== "block") continue;
    blocksDetected += 1;
    const code = extractFenceBody(node.content);
    const normalized = normalizeMarkdownFlowBlock(node.language, code, { normalization: options.normalization });
    if (!normalized) continue;
    if (normalized.normalized) blocksNormalized += 1;
    if (validateMarkdownFlowBlock(normalized.language, normalized.code).valid) validBlocks += 1;
  }

  const blocksRendered = clampCount(options.blocksRendered ?? validBlocks, blocksDetected);
  const blocksFellBack = clampCount(options.blocksFellBack ?? blocksDetected - blocksRendered, blocksDetected);
  const sourceIds = new Set((options.sources ?? []).map((source) => source.id));
  const citations = extractMarkdownFlowCitationIds(content);
  const citationsMatched = citations.filter((id) => sourceIds.has(id)).length;

  return {
    markdownRendered: options.markdownRendered ?? true,
    blocksDetected,
    blocksNormalized,
    blocksRendered,
    blocksFellBack,
    citationsMatched,
    citationsMissing: citations.length - citationsMatched,
  };
}

/**
 * Returns the development-only guidance for a substantial ordinary-Markdown
 * response. It never logs, mutates rendering, or appears unless explicitly
 * enabled by the caller.
 */
export function getMarkdownFlowNoBlocksDiagnostic(
  content: string,
  options: { enabled?: boolean; minimumCharacters?: number } = {},
): MarkdownFlowNoBlocksDiagnostic | undefined {
  if (!options.enabled || content.trim().length < (options.minimumCharacters ?? 200)) return undefined;
  const hasBlock = normalizeMarkdownFlowContent(content).some((node) => node.type === "block" || node.type === "pending");
  if (hasBlock) return undefined;
  return {
    code: "no-rich-blocks",
    title: "No Markdown Flow blocks were detected.",
    message: "Ordinary Markdown rendered successfully. To request intentional rich blocks, add the compact Markdown Flow prompt to your model instructions.",
  };
}

function extractFenceBody(content: string): string {
  const firstNewline = content.indexOf("\n");
  const closingFence = content.lastIndexOf("\n```");
  if (firstNewline === -1) return "";
  return content.slice(firstNewline + 1, closingFence === -1 ? undefined : closingFence);
}

function clampCount(value: number, maximum: number): number {
  return Math.min(maximum, Math.max(0, Math.floor(Number.isFinite(value) ? value : 0)));
}
