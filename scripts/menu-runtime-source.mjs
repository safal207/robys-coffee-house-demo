import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSync } from "esbuild";

// This module is emitted at the repository root. Keep runtime-relative imports;
// Only bundle the draft readers used by the catalog. Ordering dialogs and
// mutations are loaded on product/cart intent; the catalog remains external.
export function compileMenuRuntime(source = readFileSync("src/menu-app.js", "utf8")) {
  return buildSync({
    stdin: { contents: source, resolveDir: process.cwd(), loader: "js" },
    bundle: true, write: false, format: "esm", target: "es2020", charset: "utf8",
    external: ["./menu-catalog.js*", "./menu-search-clear.js", "./menu-interactions.js*", "./menu-order-ui.js*", "./menu-pairing.js*", "./order-checkout.js*"],
    minify: true, legalComments: "none", logLevel: "silent"
  }).outputFiles[0].text;
}

export function compileMenuOrderRuntime(source = readFileSync("src/menu-order-ui.js", "utf8")) {
  return compileMenuRuntime(source);
}

export function readVerifiedMenuOrderSource() {
  const source = readFileSync("src/menu-order-ui.js", "utf8");
  assert.equal(readFileSync("menu-order-ui.js", "utf8"), compileMenuOrderRuntime(source),
    "Generated menu-order-ui.js is stale or differs from its verified source; run npm run build");
  return source;
}

export function readVerifiedMenuSource() {
  const source = readFileSync("src/menu-app.js", "utf8");
  assert.equal(readFileSync("menu-app.js", "utf8"), compileMenuRuntime(source),
    "Generated menu-app.js is stale or differs from its verified source; run npm run build");
  return source;
}
