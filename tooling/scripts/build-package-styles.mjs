import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import postcss from "postcss";

const root = process.cwd();
const require = createRequire(import.meta.url);
const katexRoot = path.dirname(require.resolve("katex/package.json"));

const styledPackageRoots = ':where(.markdown-render, .mf-root):not([data-mf-appearance="unstyled"])';
const packageRootSelector = /^(?::where\(\s*)?\.(?:markdown-render|mf-root)(?:\b|(?=[.#:[>+~\s,) ]))/u;
const cssImport = /@import\s+["']([^"']+)["'](?:\s+layer\([^)]+\))?;\s*/g;

async function bundleCss(source, seen = new Set()) {
  const absoluteSource = path.resolve(source);
  if (seen.has(absoluteSource)) return "";
  seen.add(absoluteSource);
  const css = await readFile(absoluteSource, "utf8");
  let bundled = "";
  let cursor = 0;
  for (const match of css.matchAll(cssImport)) {
    bundled += css.slice(cursor, match.index);
    const specifier = match[1];
    const imported = specifier.startsWith(".")
      ? path.resolve(path.dirname(absoluteSource), specifier)
      : require.resolve(specifier);
    bundled += await bundleCss(imported, seen);
    cursor = (match.index ?? 0) + match[0].length;
  }
  return bundled + css.slice(cursor);
}

/**
 * Tailwind remains useful while authoring package components, but its utility
 * selectors must never become global consumer CSS. Prefix any generated or
 * third-party selector that is not already rooted, and namespace animation
 * identifiers and implementation variables before writing dist files.
 */
const isolatePackageCss = {
  postcssPlugin: "markdown-flow-isolate-package-css",
  Once(root) {
    const animationNames = new Map();

    root.walkAtRules((atRule) => {
      if (atRule.name === "property") {
        atRule.remove();
        return;
      }
      if (atRule.name === "keyframes" || atRule.name === "-webkit-keyframes") {
        const current = atRule.params.trim();
        if (!current.startsWith("mf-")) animationNames.set(current, `mf-${current}`);
      }
    });

    root.walkAtRules((atRule) => {
      if (atRule.name === "keyframes" || atRule.name === "-webkit-keyframes") {
        atRule.params = animationNames.get(atRule.params.trim()) ?? atRule.params;
      }
    });

    root.walkRules((rule) => {
      if (rule.parent?.type === "atrule" && ["keyframes", "-webkit-keyframes"].includes(rule.parent.name)) return;
      rule.selectors = rule.selectors.map((selector) => {
        if (packageRootSelector.test(selector.trim())) return selector;
        if (selector === ":root" || selector === ":host") return styledPackageRoots;
        return `${styledPackageRoots} ${selector}`;
      });
    });

    root.walkDecls((declaration) => {
      for (const [from, to] of animationNames) {
        declaration.value = declaration.value.replace(new RegExp(`(^|[\\s,])${from}(?=($|[\\s,]))`, "g"), `$1${to}`);
      }
    });
  },
};

await mkdir(path.join(root, "dist"), { recursive: true });
await cp(path.join(katexRoot, "dist/fonts"), path.join(root, "dist/fonts"), { recursive: true });

for (const [input, output] of [
  ["src/styles/package.css", "dist/styles.css"],
  ["src/styles/math.css", "dist/math.css"],
  ["src/styles/core.css", "dist/core.css"],
]) {
  const source = path.join(root, input);
  const destination = path.join(root, output);
  const css = await bundleCss(source);
  const result = await postcss([isolatePackageCss]).process(css, { from: source, to: destination });
  const isolatedCss = result.css
    .replace(/--(?!mf-)([\w-]+)/g, "--mf-internal-$1")
    .replaceAll("../../node_modules/katex/dist/fonts/", "./fonts/");
  await writeFile(destination, isolatedCss);
}

for (const output of ["dist/core.js", "dist/core.mjs"]) {
  const destination = path.join(root, output);
  try {
    const bundle = await readFile(destination, "utf8");
    if (!bundle.startsWith('"use client";')) await writeFile(destination, `"use client";\n${bundle}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
