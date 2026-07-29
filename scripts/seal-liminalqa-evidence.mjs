import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const bundleRoot = path.resolve(root, process.argv[2] ?? "qa/liminal-artifacts");
const testedCommit = process.env.ROBY_TESTED_COMMIT ?? process.env.GITHUB_SHA ?? "unknown";
const sourceRunId = process.env.ROBY_SOURCE_RUN_ID ?? process.env.GITHUB_RUN_ID ?? "local";
const runAttempt = process.env.GITHUB_RUN_ATTEMPT ?? "1";

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readRegularFileNoFollow(absolute) {
  const descriptor = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = fstatSync(descriptor);
    if (!metadata.isFile()) throw new Error(`Evidence is not a regular file: ${absolute}`);
    const content = readFileSync(descriptor);
    if (content.length !== metadata.size) {
      throw new Error(`Evidence size changed during read: ${absolute}`);
    }
    return { content, bytes: metadata.size };
  } finally {
    closeSync(descriptor);
  }
}

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Evidence bundle contains a symlink: ${path.relative(bundleRoot, absolute)}`);
    }
    if (entry.isDirectory()) files.push(...walk(absolute));
    else if (entry.isFile()) files.push(absolute);
    else throw new Error(`Unsupported evidence entry: ${path.relative(bundleRoot, absolute)}`);
  }
  return files;
}

if (!/^[0-9a-f]{40}$/i.test(testedCommit)) throw new Error("ROBY_TESTED_COMMIT must be an exact 40-character SHA");
if (!sourceRunId.trim()) throw new Error("ROBY_SOURCE_RUN_ID must not be empty");
mkdirSync(bundleRoot, { recursive: true });

const ignored = new Set(["manifest.json", "verification.json"]);
const files = walk(bundleRoot)
  .filter((file) => !ignored.has(path.basename(file)))
  .map((file) => {
    const relative = path.relative(bundleRoot, file).replaceAll(path.sep, "/");
    const { content, bytes } = readRegularFileNoFollow(file);
    return { path: relative, bytes, sha256: sha256Bytes(content) };
  })
  .sort((left, right) => left.path.localeCompare(right.path));

if (!files.length) throw new Error("Evidence bundle is empty");
const bundleId = `${testedCommit}-${sourceRunId}-${runAttempt}`;
const manifest = {
  schema: "robys.evidence.manifest.v1",
  bundleId,
  algorithm: "sha256",
  testedCommit,
  sourceRunId,
  runAttempt,
  generatedAt: new Date().toISOString(),
  files
};
const manifestPath = path.join(bundleRoot, "manifest.json");
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const { content: manifestContent } = readRegularFileNoFollow(manifestPath);
const parsed = JSON.parse(manifestContent.toString("utf8"));
for (const record of parsed.files) {
  if (path.isAbsolute(record.path) || record.path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Unsafe manifest path: ${record.path}`);
  }
  const absolute = path.join(bundleRoot, record.path);
  const { content, bytes } = readRegularFileNoFollow(absolute);
  if (bytes !== record.bytes || content.length !== record.bytes) throw new Error(`Byte mismatch: ${record.path}`);
  if (sha256Bytes(content) !== record.sha256) throw new Error(`SHA-256 mismatch: ${record.path}`);
}
const { content: manifestBytes } = readRegularFileNoFollow(manifestPath);
const verification = {
  schema: "robys.evidence.verification.v1",
  bundleId,
  testedCommit,
  sourceRunId,
  verified: true,
  verifiedFiles: parsed.files.length,
  manifestBytes: manifestBytes.length,
  manifestSha256: sha256Bytes(manifestBytes),
  verifiedAt: new Date().toISOString()
};
writeFileSync(path.join(bundleRoot, "verification.json"), `${JSON.stringify(verification, null, 2)}\n`, "utf8");
console.log(JSON.stringify(verification, null, 2));
