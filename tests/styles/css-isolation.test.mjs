import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import postcss from "postcss";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "../..");
const outputs = ["dist/styles.css", "dist/core.css", "dist/math.css"];

await execFileAsync(process.execPath, ["tooling/scripts/build-package-styles.mjs"], { cwd: root });

function isInsideKeyframes(rule) {
  let parent = rule.parent;
  while (parent) {
    if (parent.type === "atrule" && (parent.name === "keyframes" || parent.name === "-webkit-keyframes")) return true;
    parent = parent.parent;
  }
  return false;
}

test("distributed styles contain no consumer-side Tailwind directives or generic variables", async () => {
  for (const output of outputs) {
    const css = await readFile(path.join(root, output), "utf8");
    assert.doesNotMatch(css, /@(?:import|source|theme)\b/);
    assert.doesNotMatch(css, /--(?:tw|color)-/);
    for (const variable of css.matchAll(/--([\w-]+)\s*:/g)) {
      assert.match(variable[0], /^--mf-/);
    }
  }
});

test("every emitted selector is rooted inside Markdown Flow", async () => {
  for (const output of outputs) {
    const css = await readFile(path.join(root, output), "utf8");
    const ast = postcss.parse(css, { from: output });
    ast.walkRules((rule) => {
      if (isInsideKeyframes(rule)) return;
      for (const selector of rule.selectors) {
        assert.match(selector, /^(?::where\(\s*)?\.(?:markdown-render|mf-root)(?:\b|(?=[.#:[>+~\s,) ]))/u, `${output} leaked selector: ${selector}`);
      }
    });
  }
});

test("host fixture cannot be selected by package CSS", async () => {
  const fixture = await readFile(path.join(root, "tests/styles/fixtures/host-isolation.html"), "utf8");
  assert.match(fixture, /id="outside"/);
  assert.match(fixture, /material-card/);
  assert.match(fixture, /shadcn-button/);
  assert.match(fixture, /module_hash_abc123/);
  assert.match(fixture, /id="light-app"/);
  assert.match(fixture, /id="dark-app"/);
  assert.match(fixture, /id="custom-font"/);

  const css = await readFile(path.join(root, "dist/styles.css"), "utf8");
  assert.doesNotMatch(css, /(^|[},])\s*(?:html|body|button|table|p|\*)\b/);
  assert.doesNotMatch(css, /\.host-button|\.material-card|\.shadcn-button|\.module_hash_abc123|--host-accent/);
});

test("root remains neutral and appearance modes are scoped", async () => {
  const tokens = await readFile(path.join(root, "src/styles/tokens.css"), "utf8");
  const styles = await Promise.all([
    readFile(path.join(root, "src/styles/package.css"), "utf8"),
    readFile(path.join(root, "src/styles/blocks.css"), "utf8"),
  ]).then((parts) => parts.join("\n"));

  assert.match(tokens, /color:\s*inherit/);
  assert.match(tokens, /font:\s*inherit/);
  assert.match(tokens, /background:\s*transparent/);
  assert.match(tokens, /color-scheme:\s*inherit/);
  assert.doesNotMatch(tokens, /font-family:\s*Inter/i);
  assert.match(styles, /data-mf-appearance="unstyled"/);
  assert.match(styles, /data-mf-appearance="polished"/);
  assert.match(styles, /repeat\(auto-fit,\s*minmax\(min\(100%,\s*13rem\),\s*1fr\)\)/);
  assert.match(styles, /\.mf-metric-change\)[^{]*\{\s*white-space:\s*nowrap/);
  assert.match(styles, /\.mf-chart-plot/);
  assert.doesNotMatch(styles, /box-shadow:\s*none\s*!important/);
  assert.doesNotMatch(styles, /\[style\*=["']transition["']\]/);
});
