import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { catalogConsumers, catalogRevision, revisionedCatalogImport } from "./menu-catalog-revision.mjs";

const bytes = readFileSync("menu-catalog.js");
const expected = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
assert.equal(catalogRevision(bytes), expected);
const url = `./menu-catalog.js?v=${expected}`;
for (const path of [...catalogConsumers, "menu-app.js"]) {
  const source = readFileSync(path, "utf8");
  const imported = [...source.matchAll(/\bfrom\s*["'](\.\/menu-catalog\.js[^"']*)["']/g)];
  assert.equal(imported.length, 1, `${path}: one external catalog import`);
  assert.equal(imported[0][1], url, `${path}: stale catalog cache key`);
}
const worker = readFileSync("sw-core-v64.js", "utf8");
assert.ok(worker.includes(`"${url}"`), "Worker must precache the same catalog bytes as its consumers");
assert.ok(worker.includes(`catalog-${expected}-`), "Catalog content changes must advance the cache namespace");
assert.ok(worker.includes('url.pathname.endsWith("/menu-catalog.js")'), "Catalog requests retain exact revision matching");

for (const old of ["20260904-premium-order-v1", "20260930-inline-discover-v2"]) {
  const source = `import { menuCopy } from "./menu-catalog.js?v=${old}";\nconsole.log(menuCopy);\n`;
  const updated = revisionedCatalogImport(source, expected);
  assert.equal(updated, source.replace(`?v=${old}`, `?v=${expected}`), "Only the import URL may change");
  assert.equal(revisionedCatalogImport(updated, expected), updated, "Rebuild must be idempotent");
  const next = catalogRevision(Buffer.concat([bytes, Buffer.from("\n// next catalog revision\n")]));
  assert.notEqual(next, expected, "Different catalog bytes require a new cache key");
  assert.equal(revisionedCatalogImport(updated, next), updated.replace(expected, next));
}
assert.throws(() => revisionedCatalogImport("export {};", expected), /exactly one/);
assert.throws(() => revisionedCatalogImport(`import a from "./menu-catalog.js";import b from "./menu-catalog.js";`, expected), /exactly one/);
assert.throws(() => revisionedCatalogImport(`import a from "./menu-catalog.js";`, "old-key"));
console.log(`PASS MENU-CATALOG-REVISION: 5 consumers + exact worker/cache namespace use ${expected}; old keys, changed bytes and idempotence verified.`);
