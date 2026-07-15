import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createMarkdownFlow,
  createMarkdownFlowInstructions,
  MARKDOWN_FLOW_COMPACT_PROMPT,
  MARKDOWN_FLOW_LLM_BLOCK_TYPES,
  MARKDOWN_FLOW_THEME_VARIABLES,
} from "../../src/ai";

describe("compact model integration", () => {
  it("keeps the stable compact prompt below the 250-token target", () => {
    const approximateTokens = MARKDOWN_FLOW_COMPACT_PROMPT.trim().split(/\s+/).length;
    expect(approximateTokens).toBeGreaterThanOrEqual(60);
    expect(approximateTokens).toBeLessThanOrEqual(250);
    expect(MARKDOWN_FLOW_COMPACT_PROMPT).toContain("ordinary Markdown by default");
    expect(MARKDOWN_FLOW_COMPACT_PROMPT).toContain("[cite:source-id]");
  });

  it("creates task-specific compact and full contracts", () => {
    const compact = createMarkdownFlowInstructions({ blocks: ["chart", "comparison"] });
    const full = createMarkdownFlowInstructions({ blocks: ["chart", "comparison"], detail: "full", mode: "strict" });

    expect(compact).toContain("Available blocks: chart, comparison");
    expect(compact).not.toContain("Minimal valid body");
    expect(full).toContain("- chart:");
    expect(full).toContain("- comparison:");
    expect(full).not.toContain("- callout:");
    expect(full).toContain("strict JSON");
  });

  it("returns a universal setup without turning generation preferences into policy", () => {
    const flow = createMarkdownFlow({ blocks: ["chart", "comparison"] });

    expect(flow.blockTypes).toEqual(["chart", "comparison"]);
    expect(flow.policy.allowedBlocks).toEqual(MARKDOWN_FLOW_LLM_BLOCK_TYPES);
    expect(flow.instructions).toBe(flow.compactPrompt);
    expect(flow.fullPrompt).toContain("Minimal valid body");
    expect(flow.themeVariables).toBe(MARKDOWN_FLOW_THEME_VARIABLES);
  });

  it("retains allowedBlocks as an explicit compatibility restriction", () => {
    const flow = createMarkdownFlow({ allowedBlocks: ["chart"] });
    expect(flow.policy.allowedBlocks).toEqual(["chart"]);
  });

  it("ships backend-neutral static prompt assets", async () => {
    const promptRoot = resolve(process.cwd(), "prompts");
    const [compact, rag, analytics] = await Promise.all([
      readFile(resolve(promptRoot, "compact.txt"), "utf8"),
      readFile(resolve(promptRoot, "rag.txt"), "utf8"),
      readFile(resolve(promptRoot, "analytics.txt"), "utf8"),
    ]);

    expect(compact.trim()).toBe(MARKDOWN_FLOW_COMPACT_PROMPT);
    expect(rag).toContain("[cite:source-id]");
    expect(analytics).toContain("metrics, chart, comparison, progress");
  });
});
