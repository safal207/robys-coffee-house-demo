import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

// This module is emitted at the repository root. Keep runtime-relative imports;
// do not bundle the shared catalog or move interaction-only code into startup.
export function compileMenuRuntime(source = readFileSync("src/menu-app.js", "utf8")) {
  const revision = createHash("sha256").update(readFileSync("order-store.js")).digest("hex").slice(0,12);
  source = source.replace('from "./order-store.js"', `from "./order-store.js?v=${revision}"`);
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
