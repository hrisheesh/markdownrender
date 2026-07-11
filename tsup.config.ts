import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  clean: true,
  dts: {
    compilerOptions: {
      incremental: false,
    },
  },
  format: ["esm", "cjs"],
  sourcemap: true,
  external: ["react", "react-dom"],
  minify: false,
  target: "es2018",
  treeshake: true,
});
