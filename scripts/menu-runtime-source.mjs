import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSync } from "esbuild";

// This module is emitted at the repository root. Keep runtime-relative imports;
// Only bundle the small draft helpers used by the menu. Keep the catalog external
// and interaction-only code lazy; do not ship recommendation code to this page.
export function compileMenuRuntime(source = readFileSync("src/menu-app.js", "utf8")) {
  return buildSync({
    stdin: { contents: source, resolveDir: process.cwd(), loader: "js" },
    bundle: true, write: false, format: "esm", target: "es2020",
    external: ["./menu-catalog.js*", "./menu-search-clear.js", "./menu-interactions.js*"],
    minify: true, legalComments: "none", logLevel: "silent"
  }).outputFiles[0].text;
}

export function readVerifiedMenuSource() {
  const source = readFileSync("src/menu-app.js", "utf8");
  assert.equal(readFileSync("menu-app.js", "utf8"), compileMenuRuntime(source),
    "Generated menu-app.js is stale or differs from its verified source; run npm run build");
  return source;
}
