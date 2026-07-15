import { describe, expect, it } from "vitest";

import { createMarkdownFlowDiagnosticsReport, getMarkdownFlowNoBlocksDiagnostic } from "../../src/ai/diagnostics";

describe("integration diagnostics", () => {
  it("reports detected, normalized, rendered, fallback, and citation counts", () => {
    const content = [
      "Summary [cite:known] [cite:missing]\n\n",
      "```TIMELINE\n{milestones: [{name: 'Launch'}]}\n```\n",
      "```chart\n{\"type\":\"bar\",\"data\":[]}\n```\n",
    ].join("");

    expect(createMarkdownFlowDiagnosticsReport(content, { sources: [{ id: "known" }] })).toEqual({
      markdownRendered: true,
      blocksDetected: 2,
      blocksNormalized: 1,
      blocksRendered: 1,
      blocksFellBack: 1,
      citationsMatched: 1,
      citationsMissing: 1,
    });
  });

  it("accepts renderer outcome overrides and clamps impossible values", () => {
    const content = "```callout\n{\"title\":\"Hello\"}\n```\n";
    expect(createMarkdownFlowDiagnosticsReport(content, { blocksRendered: 8, blocksFellBack: -2, markdownRendered: false })).toMatchObject({
      markdownRendered: false,
      blocksDetected: 1,
      blocksRendered: 1,
      blocksFellBack: 0,
    });
  });

  it("returns no-rich-output guidance only when explicitly enabled and useful", () => {
    const longMarkdown = `# Answer\n\n${"Useful ordinary Markdown. ".repeat(12)}`;
    expect(getMarkdownFlowNoBlocksDiagnostic(longMarkdown)).toBeUndefined();
    expect(getMarkdownFlowNoBlocksDiagnostic("Short", { enabled: true })).toBeUndefined();
    expect(getMarkdownFlowNoBlocksDiagnostic(longMarkdown, { enabled: true })).toMatchObject({ code: "no-rich-blocks" });
    expect(getMarkdownFlowNoBlocksDiagnostic(`${longMarkdown}\n\n\`\`\`callout\n{\"title\":\"Note\"}\n\`\`\``, { enabled: true })).toBeUndefined();
  });
});
