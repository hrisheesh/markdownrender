import { describe, expect, it } from "vitest";

import { applyMarkdownFlowEnhancements, enhanceMarkdownFlowContent } from "../../src/ai/enhancement";
import { normalizeMarkdownFlowContent } from "../../src/ai/model";
import { validateMarkdownFlowBlock } from "../../src/ai/validation";

describe("zero-contract Markdown enhancement", () => {
  it("is an identity operation when enhancement is off", () => {
    const markdown = "- [x] Shipped\n- [ ] Documented\n";
    expect(enhanceMarkdownFlowContent(markdown, "off")).toEqual({
      content: markdown,
      originalMarkdown: markdown,
      mode: "off",
      enhanced: false,
      transformations: [],
    });
  });

  it("safely enhances task lists while retaining the exact fallback", () => {
    const markdown = "Before\n\n- [x] Shipped\n- [ ] Documented\n\nAfter\n";
    const result = enhanceMarkdownFlowContent(markdown);

    expect(result.content).toContain("```checklist");
    expect(result.content).toContain('{"items":[{"title":"Shipped","checked":true},{"title":"Documented","checked":false}]}');
    expect(result.transformations[0]).toMatchObject({ type: "checklist", confidence: 0.99, originalMarkdown: "- [x] Shipped\n- [ ] Documented\n" });
    expect(result.originalMarkdown).toBe(markdown);
  });

  it("enhances only obvious numeric, percentage, and dated tables", () => {
    const metrics = applyMarkdownFlowEnhancements("| Metric | Value |\n| --- | ---: |\n| Users | 24,800 |\n| Revenue | $1,200 |\n");
    const progress = applyMarkdownFlowEnhancements("| Work | Completion |\n| --- | ---: |\n| API | 80% |\n| Docs | 50% |\n");
    const timeline = applyMarkdownFlowEnhancements("| Date | Release |\n| --- | --- |\n| 2026-07-10 | Beta |\n| 2026-07-16 | Stable |\n");
    const ambiguous = "| Name | Note |\n| --- | --- |\n| API | Ready |\n| UI | Review |\n";

    expect(metrics).toContain("```metrics");
    expect(progress).toContain("```progress");
    expect(timeline).toContain("```timeline");
    expect(applyMarkdownFlowEnhancements(ambiguous)).toBe(ambiguous);
  });

  it("enhances dated lists and strongly recognizable file trees", () => {
    const dated = "- 2026-07-10 — Beta\n- 2026-07-16 — Stable\n";
    const tree = "```text\nsrc/\n├── ai/\n│   └── stream.ts\n└── index.ts\n```\n";

    expect(applyMarkdownFlowEnhancements(dated)).toContain("```timeline");
    expect(applyMarkdownFlowEnhancements(tree)).toContain("```filetree");
  });

  it("leaves ordinary code, prose, and low-confidence singletons alone in safe mode", () => {
    const source = "- [ ] One task\n\n```typescript\nconst tree = 'src/';\n```\n";
    expect(applyMarkdownFlowEnhancements(source)).toBe(source);
    expect(applyMarkdownFlowEnhancements("- [ ] One task\n", "aggressive")).toContain("```checklist");
  });

  it("produces blocks accepted by the existing parser and validator", () => {
    const content = applyMarkdownFlowEnhancements("- [x] Ship\n- [ ] Verify\n");
    const node = normalizeMarkdownFlowContent(content)[0];
    expect(node).toMatchObject({ type: "block", language: "checklist" });
    if (node.type !== "block") throw new Error("Expected a block");
    const body = node.content.slice(node.content.indexOf("\n") + 1, node.content.lastIndexOf("\n```"));
    expect(validateMarkdownFlowBlock("checklist", body)).toEqual({ valid: true });
  });
});
