#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const ROOT_REAL = realpathSync(ROOT);
const OUTPUT = process.env.CONTROL_PLANE_MANIFEST || ".artifacts/control-plane-integrity-manifest.json";
const DIRECTORIES = [".github/workflows", "scripts", "qa", "docs/contracts"];
const ROOT_FILES = ["package.json", "package-lock.json", "tsconfig.json", "docs/ltp-audit-evidence.md"];
const EXTENSIONS = new Set([".cjs", ".js", ".json", ".jsonl", ".md", ".mjs", ".ts", ".tsx", ".yaml", ".yml"]);
const EXCLUDED_NAMES = new Set(["node_modules", ".artifacts", "coverage", "dist", "visual-results"]);

function fail(message) {
  throw new Error(`CONTROL-PLANE-INTEGRITY-001: ${message}`);
}

function normalized(value) {
  return value.split(path.sep).join("/");
}

function insideRoot(absolute, label) {
  const resolved = realpathSync(absolute);
  const relative = path.relative(ROOT_REAL, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail(`${label} resolves outside repository root`);
  }
  return resolved;
}

function assertNoSymlink(absolute, label) {
  const relative = path.relative(ROOT, absolute);
  let cursor = ROOT;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    if (lstatSync(cursor).isSymbolicLink()) fail(`${label} contains symlink component: ${normalized(path.relative(ROOT, cursor))}`);
  }
  insideRoot(absolute, label);
}

function walk(directory) {
  if (!existsSync(directory)) fail(`required directory is missing: ${normalized(path.relative(ROOT, directory))}`);
  assertNoSymlink(directory, normalized(path.relative(ROOT, directory)));
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (EXCLUDED_NAMES.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    const relative = normalized(path.relative(ROOT, absolute));
    if (entry.isSymbolicLink()) fail(`symlink is forbidden: ${relative}`);
    if (entry.isDirectory()) files.push(...walk(absolute));
    else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(relative);
  }
  return files;
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const files = [];
for (const directory of DIRECTORIES) files.push(...walk(path.join(ROOT, directory)));
for (const relative of ROOT_FILES) {
  const absolute = path.join(ROOT, relative);
  if (!existsSync(absolute)) fail(`required file is missing: ${relative}`);
  assertNoSymlink(absolute, relative);
  if (!statSync(absolute).isFile()) fail(`required path is not a file: ${relative}`);
  files.push(relative);
}

const unique = [...new Set(files)].sort((left, right) => left.localeCompare(right, "en"));
for (const required of [
  ".github/workflows/security.yml",
  ".github/workflows/codeql.yml",
  ".github/workflows/review-ledger.yml",
  ".github/workflows/ltp-exact-head-audit.yml",
  "scripts/ltp-inspect.mjs",
  "scripts/test-ltp-inspector.mjs",
  "scripts/verify-integrity-manifest.mjs",
  "scripts/generate-integrity-manifest.mjs",
  "docs/contracts/ltp-project-trace.v1.schema.json",
  "docs/contracts/ltp-critical-actions.v0.1.json",
  "docs/ltp-audit-evidence.md",
  "qa/ltp/traces/project-audit.clean.jsonl",
  "package.json",
  "package-lock.json"
]) {
  if (!unique.includes(required)) fail(`required control-plane file is not covered: ${required}`);
}

let sourceHead = process.env.AUDIT_HEAD?.trim() || null;
if (!sourceHead) {
  try {
    sourceHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    sourceHead = null;
  }
}
if (sourceHead !== null && !/^[0-9a-f]{40}$/i.test(sourceHead)) fail(`AUDIT_HEAD must be a full 40-character SHA, got ${sourceHead}`);

const manifest = {
  version: 1,
  algorithm: "sha256",
  contract: "CONTROL-PLANE-INTEGRITY-001",
  sourceHead: sourceHead?.toLowerCase() ?? null,
  files: unique.map((relative) => {
    const absolute = path.join(ROOT, relative);
    assertNoSymlink(absolute, relative);
    const bytes = readFileSync(absolute);
    return { path: relative, bytes: bytes.byteLength, sha256: digest(bytes) };
  })
};

mkdirSync(path.dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`✅ CONTROL-PLANE-INTEGRITY-001 captured ${manifest.files.length} files${manifest.sourceHead ? ` at ${manifest.sourceHead}` : ""}.`);
