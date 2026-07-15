import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";

import { parseArguments, runCli, verifyPrompt } from "../../tooling/cli/markdown-flow.mjs";

const api = {
  MARKDOWN_FLOW_PROTOCOL: "markdown-flow/v1",
  MARKDOWN_FLOW_COMPACT_PROMPT: "Compact Markdown Flow prompt.",
  AI_RESPONSE_PRESETS: ["minimal", "chat", "rag", "technical", "analytics"],
  getAIResponsePresetPolicy(preset) {
    return { allowedBlocks: preset === "technical" ? ["steps", "mermaid"] : ["steps"] };
  },
  MARKDOWN_FLOW_LLM_BLOCK_TYPES: ["steps", "mermaid", "chart", "timeline"],
  createMarkdownFlowInstructions({ blocks, detail, mode }) {
    return [
      "Markdown Flow contract: markdown-flow/v1.",
      `Available block types: ${blocks.join(", ") || "none"}.`,
      mode === "strict" ? "Each rich block must use strict JSON." : "Use simple JSON-style output.",
      "Use meaningful, non-empty data.",
      "Never invent sources or data. Cite using [cite:source-id].",
      `Detail: ${detail}.`,
    ].join("\n");
  },
};

function createIo(input = "") {
  const stdin = new PassThrough();
  stdin.end(input);
  const stdout = new PassThrough();
  let output = "";
  stdout.on("data", (chunk) => { output += chunk; });
  return { stdin, stdout, get output() { return output; } };
}

test("generate-prompt uses the selected preset policy", async () => {
  const io = createIo();
  await runCli(["generate-prompt", "--preset", "technical"], { api, io });
  assert.match(io.output, /Available block types: steps, mermaid/);
});

test("prompt supports task-specific blocks and strict mode", async () => {
  const io = createIo();
  await runCli(["prompt", "--blocks", "chart,timeline", "--strict"], { api, io });
  assert.match(io.output, /Available block types: chart, timeline/);
  assert.match(io.output, /strict JSON/);
  assert.match(io.output, /Detail: full/);
});

test("generate-config produces the public policy as JSON", async () => {
  const io = createIo();
  await runCli(["generate-config", "--preset", "minimal", "--format", "json"], { api, io });
  assert.deepEqual(JSON.parse(io.output), {
    protocol: "markdown-flow/v1",
    preset: "minimal",
    renderPolicy: { allowedBlocks: ["steps"] },
  });
});

test("verify-prompt accepts generated instructions and rejects missing safeguards", async () => {
  const goodPrompt = api.createMarkdownFlowInstructions({ blocks: ["steps"], detail: "compact", mode: "normalize" });
  assert.deepEqual(verifyPrompt(goodPrompt, { protocol: "markdown-flow/v1", allowedBlocks: ["steps"] }), []);
  const io = createIo(goodPrompt);
  await runCli(["verify"], { api, io });
  assert.equal(io.output, 'Prompt verified for preset "chat".\n');
  assert.match(
    verifyPrompt("Markdown Flow contract: markdown-flow/v1.", { protocol: "markdown-flow/v1", allowedBlocks: ["steps"] }).join(" "),
    /missing requested blocks/,
  );
});

test("argument parsing rejects unsupported commands and options", () => {
  assert.throws(() => parseArguments(["publish"]), /Unknown command/);
  assert.throws(() => parseArguments(["doctor", "--preset", "chat"]), /Unknown option|--preset/);
  assert.throws(() => parseArguments(["generate-config", "--format"]), /requires a value/);
  assert.throws(() => parseArguments(["generate-prompt", "--preset", "chat", "--preset", "rag"]), /only be provided once/);
  assert.throws(() => parseArguments(["prompt", "--compact", "--strict"]), /cannot be used together/);
  assert.deepEqual(parseArguments(["prompt", "prompt.txt"]), { command: "prompt", output: "prompt.txt" });
  assert.deepEqual(parseArguments(["verify", "prompt.txt"]), { command: "verify", input: "prompt.txt" });
});

test("doctor checks the package metadata and bundled API", async () => {
  const io = createIo();
  await runCli(["doctor"], { api, io });
  assert.match(io.output, /✓ installed version/);
  assert.match(io.output, /✓ bundled AI module/);
});
