import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

// This module is emitted at the repository root. Keep runtime-relative imports;
// do not bundle the shared catalog or move interaction-only code into startup.
export function compileMenuRuntime(source = readFileSync("src/menu-app.js", "utf8")) {
  return transformSync(source, {
    loader: "js", format: "esm", target: "es2020",
    minify: true, legalComments: "none"
  }).code;
}

export function readVerifiedMenuSource() {
  const source = readFileSync("src/menu-app.js", "utf8");
  assert.equal(readFileSync("menu-app.js", "utf8"), compileMenuRuntime(source),
    "Generated menu-app.js is stale or differs from its verified source; run npm run build");
  return source;
}
