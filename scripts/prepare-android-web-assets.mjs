import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");

export function prepareWebAssets(root, sourceSha) {
  assert.match(sourceSha, /^[0-9a-f]{40}$/);
  const manifestBytes = readFileSync(join(root, "integrity-manifest.json"));
  const manifest = JSON.parse(manifestBytes);
  const files = new Map([["integrity-manifest.json", manifestBytes]]);
  for (const entry of manifest.files) {
    const path = entry.path;
    assert(typeof path === "string" && !isAbsolute(path) && !path.includes("\\") &&
      path.split("/").every(part => part && part !== "." && part !== ".."), "Unsafe asset path");
    if (path.startsWith("android-native/")) continue;
    const bytes = readFileSync(join(root, path));
    assert.equal(bytes.length, entry.bytes, `Size mismatch: ${path}`);
    assert.equal(hash(bytes), entry.sha256, `Hash mismatch: ${path}`);
    files.set(path, bytes);
  }
  assert(files.has("index.html"), "Missing landing page");
  const output = join(root, "android-native/app/build/qa-web-assets/qa-web");
  assert(!existsSync(output), "Use a fresh build directory; stale test assets are not reused");
  for (const [path, bytes] of files) {
    const target = join(output, "site", path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  const source = { sourceSha, manifestSha256: hash(manifestBytes), files: files.size,
    webSource: "packaged-current-head", origin: "https://safal207.github.io/robys-coffee-house-demo/" };
  writeFileSync(join(output, "source.json"), JSON.stringify(source) + "\n");
  return source;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { encoding: "utf8" }).trim(), "",
    "Packaged web evidence requires a clean committed checkout");
  console.log(JSON.stringify(prepareWebAssets(process.cwd(), execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim())));
}
