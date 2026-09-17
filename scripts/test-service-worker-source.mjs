import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { readServiceWorkerSource, readServiceWorkerSources, SERVICE_WORKER_CORE } from "./service-worker-source.mjs";

const root = mkdtempSync(join(tmpdir(), "robys-worker-source-"));
try {
  const wrapper = 'self.addEventListener("fetch", repair);\nimportScripts("./sw-core-v64.js");\n';
  const core = 'const CACHE_VERSION = "fixture";\n';
  writeFileSync(join(root, "sw.js"), wrapper);
  writeFileSync(join(root, SERVICE_WORKER_CORE), core);
  assert.equal(readServiceWorkerSource(root), `${wrapper}\n${core}`);
  assert.equal(readServiceWorkerSources(root).corePath, join(root, SERVICE_WORKER_CORE));

  for (const invalid of [
    '// importScripts("./sw-core-v64.js");',
    'const lure = \'importScripts("./sw-core-v64.js");\';',
    'importScripts("https://example.test/sw-core-v64.js");',
    'importScripts("./missing-core.js");',
    'importScripts(corePath);',
    'importScripts("./sw-core-v64.js", "./other.js");',
    'importScripts("./sw-core-v64.js"); importScripts("./other.js");'
  ]) {
    writeFileSync(join(root, "sw.js"), invalid);
    assert.throws(() => readServiceWorkerSource(root), /must import exactly the local core/);
  }
  writeFileSync(join(root, "sw.js"), wrapper);
  rmSync(join(root, SERVICE_WORKER_CORE));
  assert.throws(() => readServiceWorkerSource(root), /ENOENT/);
} finally {
  rmSync(root, { recursive: true, force: true });
}

const { wrapper, core } = readServiceWorkerSources();
assert.ok(wrapper.includes("event.stopImmediatePropagation()"), "Video repair handler must stay in the entry worker");
assert.ok(!wrapper.includes("const CACHE_VERSION"), "Cache revisions must remain in the imported core");
const revisionedAssets = ["discover-v2.js", "discover-rotation-v3.js", "discover-rotation.css"];
if (process.argv.includes("--built")) revisionedAssets.push("android-app.css", "conversion.js");
for (const file of revisionedAssets) {
  const revision = createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 12);
  assert.ok(core.includes(`"./${file}?v=${revision}"`), `Imported core must precache the built revision of ${file}`);
}
console.log(`PASS: split service-worker sources and ${revisionedAssets.length} cache revisions`);
