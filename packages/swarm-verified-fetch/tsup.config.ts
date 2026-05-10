import { defineConfig } from "tsup";

/**
 * Multi-target build:
 *   - ESM + CJS for both the library entry and the CLI.
 *   - .d.ts (and .d.cts) generated for the library entry only.
 *   - The CLI source carries a shebang; tsup preserves it and the resulting
 *     dist/cli.js is marked executable so it works as a `bin`.
 */
export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
  },
  format: ["esm", "cjs"],
  dts: { entry: { index: "src/index.ts" } },
  sourcemap: true,
  clean: true,
  target: "es2022",
  splitting: false,
  treeshake: true,
  minify: false,
  shims: false,
});
