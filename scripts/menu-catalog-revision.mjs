import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

// These are authored entry modules, not emitted bundles. Keep every active
// consumer on the same content-addressed catalog before compiling runtime code.
export const catalogConsumers = Object.freeze([
  "src/menu-app.js", "menu-product-reveal-runtime.js", "discover-deck.js", "discover-v2.js"
]);
export const catalogRevision = (bytes = readFileSync("menu-catalog.js")) =>
  createHash("sha256").update(bytes).digest("hex").slice(0, 12);

export function revisionedCatalogImport(source, revision) {
  assert.match(revision, /^[0-9a-f]{12}$/);
  const pattern = /(\bfrom\s*)(["'])\.\/menu-catalog\.js(?:\?v=[^"']*)?\2/g;
  assert.equal([...source.matchAll(pattern)].length, 1, "Expected exactly one static menu catalog import");
  return source.replace(pattern, (_, prefix, quote) => `${prefix}${quote}./menu-catalog.js?v=${revision}${quote}`);
}

export function synchronizeCatalogImports() {
  const revision = catalogRevision();
  for (const path of catalogConsumers) {
    const original = readFileSync(path, "utf8");
    const next = revisionedCatalogImport(original, revision);
    if (original !== next) writeFileSync(path, next);
  }
  return revision;
}
