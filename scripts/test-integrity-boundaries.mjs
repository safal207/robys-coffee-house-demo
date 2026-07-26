#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const verifier = path.join(ROOT, "scripts/verify-integrity-manifest.mjs");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function makeFixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "robis-integrity-"));
  const files = [];
  for (const [index, name] of ["index.html", "menu.html", "a.txt", "b.txt", "c.txt", "d.txt", "e.txt", "f.txt", "g.txt", "h.txt"].entries()) {
    const content = name.endsWith(".html")
      ? `<meta name="robys-build" content="fixture-1"><p>${name}</p>\n`
      : `fixture-${index}\n`;
    writeFileSync(path.join(directory, name), content);
    const bytes = readFileSync(path.join(directory, name));
    files.push({ path: name, bytes: bytes.byteLength, sha256: sha256(bytes) });
  }
  writeFileSync(path.join(directory, "integrity-manifest.json"), `${JSON.stringify({ version: 1, algorithm: "sha256", build: "fixture-1", files })}\n`);
  return directory;
}

function invoke(directory) {
  return spawnSync(process.execPath, [verifier], { cwd: directory, encoding: "utf8" });
}

const results = [];

{
  const directory = makeFixture();
  const child = invoke(directory);
  assert.equal(child.status, 0, child.stderr);
  results.push({ case: "clean", exit_code: child.status });
}

{
  const directory = makeFixture();
  const outside = path.join(directory, "..", `outside-${path.basename(directory)}.txt`);
  writeFileSync(outside, "outside\n");
  const target = path.join(directory, "linked.txt");
  symlinkSync(outside, target);
  const manifest = JSON.parse(readFileSync(path.join(directory, "integrity-manifest.json"), "utf8"));
  const bytes = readFileSync(target);
  manifest.files.push({ path: "linked.txt", bytes: bytes.byteLength, sha256: sha256(bytes) });
  writeFileSync(path.join(directory, "integrity-manifest.json"), `${JSON.stringify(manifest)}\n`);
  const child = invoke(directory);
  assert.notEqual(child.status, 0);
  assert.match(`${child.stdout}\n${child.stderr}`, /symlink/i);
  results.push({ case: "outside-root-symlink", exit_code: child.status });
}

{
  const directory = makeFixture();
  const manifest = JSON.parse(readFileSync(path.join(directory, "integrity-manifest.json"), "utf8"));
  manifest.files.push({ ...manifest.files[0] });
  writeFileSync(path.join(directory, "integrity-manifest.json"), `${JSON.stringify(manifest)}\n`);
  const child = invoke(directory);
  assert.notEqual(child.status, 0);
  results.push({ case: "duplicate-path", exit_code: child.status });
}

{
  const directory = makeFixture();
  const manifest = JSON.parse(readFileSync(path.join(directory, "integrity-manifest.json"), "utf8"));
  manifest.files[2].path = "../escape.txt";
  writeFileSync(path.join(directory, "integrity-manifest.json"), `${JSON.stringify(manifest)}\n`);
  const child = invoke(directory);
  assert.notEqual(child.status, 0);
  results.push({ case: "path-traversal", exit_code: child.status });
}

{
  const directory = makeFixture();
  const manifest = JSON.parse(readFileSync(path.join(directory, "integrity-manifest.json"), "utf8"));
  manifest.files[2].sha256 = "0".repeat(64);
  writeFileSync(path.join(directory, "integrity-manifest.json"), `${JSON.stringify(manifest)}\n`);
  const child = invoke(directory);
  assert.notEqual(child.status, 0);
  results.push({ case: "tampered-digest", exit_code: child.status });
}

{
  const directory = makeFixture();
  writeFileSync(path.join(directory, "integrity-manifest.json"), "{broken\n");
  const child = invoke(directory);
  assert.notEqual(child.status, 0);
  results.push({ case: "malformed-json", exit_code: child.status });
}

mkdirSync(path.join(ROOT, ".artifacts"), { recursive: true });
writeFileSync(path.join(ROOT, ".artifacts/integrity-boundary-results.json"), `${JSON.stringify({ results }, null, 2)}\n`);
console.log(`✅ INTEGRITY-001 boundary tests passed: ${results.length} scenarios.`);
