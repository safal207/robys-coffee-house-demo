import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { createHash } from "node:crypto";

// This module is emitted at the repository root. Keep runtime-relative imports;
// do not bundle the shared catalog or move interaction-only code into startup.
export function compileMenuRuntime(source = readFileSync("src/menu-app.js", "utf8")) {
  if (source.includes("src/order-draft.js?v=shared-order-v1")) {
    const revision = createHash("sha256").update(readFileSync("src/order-draft.js")).digest("hex").slice(0, 12);
    source = source.replace("src/order-draft.js?v=shared-order-v1", `src/order-draft.js?v=${revision}`);
  }
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
