import { describe, expect, it } from "vitest";

import { normalizeMarkdownFlowBlock, validateMarkdownFlowBlock } from "../../src/ai/validation";

describe("Markdown Flow validation normalization", () => {
  it("accepts harmless documented language aliases by default", () => {
    expect(validateMarkdownFlowBlock("CALLOUT", JSON.stringify({ title: "Safe" }))).toEqual({ valid: true });
    expect(validateMarkdownFlowBlock("mermaidjs", "graph TD; A-->B")).toEqual({ valid: true });
  });

  it("can opt out of normalization and keeps JSON diagnostics actionable", () => {
    expect(validateMarkdownFlowBlock("CALLOUT", JSON.stringify({ title: "Safe" }), undefined, { normalization: "strict" })).toMatchObject({
      valid: false,
      reason: expect.stringContaining("CALLOUT"),
    });
    expect(validateMarkdownFlowBlock("callout", "{oops")).toMatchObject({
      valid: false,
      reason: expect.stringContaining("valid JSON"),
    });
  });

  it("canonicalizes only documented, unambiguous field aliases", () => {
    expect(normalizeMarkdownFlowBlock("timeline", JSON.stringify({ milestones: [{ title: "Launch" }] }))).toMatchObject({
      normalized: true,
      code: JSON.stringify({ items: [{ title: "Launch" }] }),
    });
    expect(validateMarkdownFlowBlock("checklist", JSON.stringify({ tasks: [{ title: "Review", completed: true }] }))).toEqual({ valid: true });
    expect(validateMarkdownFlowBlock("chart", JSON.stringify({ type: "line", data: [{ month: "Jan", users: 1 }], xAxis: "month", yAxis: "users" }))).toEqual({ valid: true });
    expect(validateMarkdownFlowBlock("chart", JSON.stringify({ type: "line", data: [{ month: "Jan", users: 1 }], xAxis: "month", yAxis: "users" }), undefined, { normalization: "strict" })).toMatchObject({ valid: false });
  });

  it("accepts common JSON5, wrappers, arrays, and item aliases in normalize mode", () => {
    expect(validateMarkdownFlowBlock("tabs", "{ sections: [{ heading: 'Overview', text: 'Readable', }], extra: true, }")).toEqual({ valid: true });
    expect(normalizeMarkdownFlowBlock("cards", "[{ heading: 'Launch', text: 'Ready' }]")).toMatchObject({
      code: JSON.stringify({ cards: [{ title: "Launch", description: "Ready" }] }),
    });
    expect(validateMarkdownFlowBlock("filetree", JSON.stringify({ payload: { entries: [{ label: "src", kind: "directory" }] } }))).toEqual({ valid: true });
    expect(validateMarkdownFlowBlock("tabs", "{ tabs: [{ label: 'Overview', content: 'Readable', }] }", undefined, { normalization: "strict" })).toMatchObject({ valid: false });
  });

  it("normalizes common Chart.js and Apex-style series without weakening strict mode", () => {
    const chartJs = { type: "column", data: { labels: ["Jan", "Feb"], datasets: [{ label: "Users", data: [12, 18] }] } };
    expect(validateMarkdownFlowBlock("chart", JSON.stringify(chartJs))).toEqual({ valid: true });
    expect(validateMarkdownFlowBlock("chart", JSON.stringify(chartJs), undefined, { normalization: "strict" })).toMatchObject({ valid: false });

    const apex = { type: "line", categories: ["Jan", "Feb"], series: [{ name: "Users", data: [12, 18] }] };
    expect(validateMarkdownFlowBlock("chart", JSON.stringify(apex))).toEqual({ valid: true });
  });

  it("accepts bounded empty collections so the renderer can show a neutral state", () => {
    expect(validateMarkdownFlowBlock("tabs", JSON.stringify({ title: "Details", tabs: [] }))).toEqual({ valid: true });
    expect(validateMarkdownFlowBlock("comparison", JSON.stringify({ columns: [], rows: [] }))).toEqual({ valid: true });
  });

  it("normalizes block-aware container, child, completion, date, and language aliases", () => {
    expect(validateMarkdownFlowBlock("milestones", JSON.stringify({ events: [{ heading: "Beta", when: "Tomorrow", details: "Ship it", state: "planned" }] }))).toEqual({ valid: true });
    const checklist = normalizeMarkdownFlowBlock("tasks", JSON.stringify({ recommendations: [{ name: "Review", status: "completed" }] }));
    expect(checklist).toMatchObject({
      language: "checklist",
      classification: "compatible",
    });
    expect(JSON.parse(checklist?.code ?? "{}")).toEqual({ items: [{ title: "Review", status: "complete", checked: true }] });
    expect(normalizeMarkdownFlowBlock("tree", JSON.stringify({ nodes: [{ path: "src/", kind: "directory" }] }))).toMatchObject({
      code: JSON.stringify({ files: [{ name: "src/", type: "folder" }] }),
    });
    expect(validateMarkdownFlowBlock("compare", JSON.stringify({ headers: ["Basic", "Pro"], criteria: [{ feature: "Seats", Basic: 2, Pro: 10 }] }))).toEqual({ valid: true });
  });

  it("infers row, multi-series, object-map, and tuple chart forms", () => {
    expect(normalizeMarkdownFlowBlock("chart", JSON.stringify({ data: [{ month: "Jan", revenue: 120, cost: 80 }] }))).toMatchObject({
      confidence: expect.any(Number),
      classification: "compatible",
      code: JSON.stringify({ data: [{ month: "Jan", revenue: 120, cost: 80 }], x: "month", keys: ["revenue", "cost"], type: "bar" }),
    });
    expect(validateMarkdownFlowBlock("graph", JSON.stringify({ Jan: 120, Feb: 160 }))).toEqual({ valid: true });
    expect(normalizeMarkdownFlowBlock("chart", JSON.stringify({ data: [[100, 25], [200, 41]] }))).toMatchObject({
      code: JSON.stringify({ data: [{ x: 100, y: 25 }, { x: 200, y: 41 }], x: "x", y: "y", type: "scatter" }),
    });
    expect(validateMarkdownFlowBlock("chart", JSON.stringify({ series: [{ name: "Revenue", data: [120, 160] }] }))).toEqual({ valid: true });
    expect(validateMarkdownFlowBlock("chart", JSON.stringify({ xaxis: { categories: ["Jan", "Feb"] }, series: [{ name: "Revenue", data: [120, 160] }] }))).toEqual({ valid: true });
    expect(validateMarkdownFlowBlock("chart", JSON.stringify({ data: { Jan: 120, Feb: 160 } }))).toEqual({ valid: true });
  });

  it("reports confidence, transformations, and readable low-confidence fallbacks", () => {
    const compatible = normalizeMarkdownFlowBlock("stats", "{ values: { Revenue: 120 } }");
    expect(compatible).toMatchObject({
      language: "metrics",
      normalized: true,
      classification: "compatible",
      confidence: expect.any(Number),
      transformations: expect.arrayContaining([expect.stringContaining("Mapped block language")]),
    });

    const ambiguous = normalizeMarkdownFlowBlock("chart", JSON.stringify({ data: [{ month: "Jan", sentiment: "good" }] }));
    expect(ambiguous).toMatchObject({
      classification: "fallback",
      confidence: expect.closeTo(0.45, 2),
      fallback: { kind: "table", columns: ["month", "sentiment"], rows: [["Jan", "good"]] },
    });
    expect(validateMarkdownFlowBlock("chart", JSON.stringify({ data: [{ month: "Jan", sentiment: "good" }] }))).toMatchObject({
      valid: false,
      classification: "invalid",
    });
  });
});
