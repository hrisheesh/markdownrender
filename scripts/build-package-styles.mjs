import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

const root = process.cwd();
const source = path.join(root, "src/styles/package.css");
const destination = path.join(root, "dist/styles.css");
const require = createRequire(import.meta.url);
const katexRoot = path.dirname(require.resolve("katex/package.json"));
const css = await readFile(source, "utf8");
const result = await postcss([tailwindcss()]).process(css, { from: source, to: destination });

await mkdir(path.dirname(destination), { recursive: true });
await cp(path.join(katexRoot, "dist/fonts"), path.join(root, "dist/fonts"), { recursive: true });
await writeFile(
  destination,
  result.css.replaceAll("../../node_modules/katex/dist/fonts/", "./fonts/"),
);
