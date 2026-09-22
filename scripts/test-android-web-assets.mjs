import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { prepareWebAssets } from "./prepare-android-web-assets.mjs";

const root = mkdtempSync(join(tmpdir(), "robys-web-assets-"));
try {
const page = Buffer.from("<!doctype html><title>Exact bytes</title>");
const entry = { path: "index.html", bytes: page.length, sha256: createHash("sha256").update(page).digest("hex") };
const manifest = files => writeFileSync(join(root, "integrity-manifest.json"), JSON.stringify({ files }));
const sha = "a".repeat(40);
writeFileSync(join(root, "index.html"), page);
manifest([{ ...entry, path: "../outside.html" }]);
assert.throws(() => prepareWebAssets(root, sha), /Unsafe asset path/);
manifest([{ ...entry, sha256: "0".repeat(64) }]);
assert.throws(() => prepareWebAssets(root, sha), /Hash mismatch/);
assert(!existsSync(join(root, "android-native")), "Invalid bytes must not produce a partial bundle");
manifest([entry]);
const source = prepareWebAssets(root, sha);
assert.equal(source.sourceSha, sha);
assert.deepEqual(readFileSync(join(root, "android-native/app/build/qa-web-assets/qa-web/site/index.html")), page);
assert.throws(() => prepareWebAssets(root, sha), /fresh build directory/);
console.log("Android web assets: traversal, tampering, exact bytes and stale bundle checks PASS");
} finally {
  assert(resolve(root).startsWith(resolve(tmpdir()) + sep + "robys-web-assets-"));
  rmSync(root, { recursive: true, force: true });
}
