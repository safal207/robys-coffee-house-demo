import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const OUTPUT = "integrity-manifest.json";
const CHECK_MODE = process.argv.includes("--check");
const excludedDirectories = new Set([
  ".git",
  ".github",
  ".artifacts",
  "coverage",
  "dist",
  "docs",
  "lighthouse",
  "node_modules",
  "qa",
  "scripts",
  "visual-results"
]);
const excludedRootFiles = new Set([
  OUTPUT,
  ".markdownlint.json",
  "lighthouse-live-summary.json",
  "lighthouse-summary.json",
  "package.json",
  "package-lock.json",
  "tsconfig.json"
]);
const publicExtensions = new Set([
  ".css",
  ".html",
  ".ico",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".mp4",
  ".webm",
  ".png",
  ".svg",
  ".txt",
  ".webmanifest",
  ".webp",
  ".xml"
]);
const canonicalTextExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".svg",
  ".txt",
  ".webmanifest",
  ".xml"
]);

function normalized(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) return [];
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(absolute);
    const relativePath = normalized(path.relative(ROOT, absolute));
    if (!relativePath.includes("/") && excludedRootFiles.has(relativePath)) return [];
    if (!publicExtensions.has(path.extname(entry.name).toLowerCase())) return [];
    return [relativePath];
  });
}

function canonicalBytes(file, bytes) {
  const extension = path.extname(file).toLowerCase();
  if (!canonicalTextExtensions.has(extension)) return bytes;

  // Repository text files are explicitly checked out as LF via .gitattributes.
  // Normalize legacy/foreign CRLF input to that same canonical Git/deployable form
  // so generator, raw HEAD blobs and the independent verifier share one byte truth.
  return Buffer.from(bytes.toString("utf8").replace(/\r\n?/g, "\n"), "utf8");
}

function digest(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

const indexHtml = readFileSync("index.html", "utf8");
const build = indexHtml.match(/<meta\b[^>]*name=["']robys-build["'][^>]*content=["']([^"']+)["']/i)?.[1];
if (!build) throw new Error("INTEGRITY-001: index.html is missing the robys-build marker");

const files = walk(ROOT)
  .filter((file) => statSync(path.join(ROOT, file)).isFile())
  .sort((left, right) => left.localeCompare(right, "en"))
  .map((file) => {
    const bytes = canonicalBytes(file, readFileSync(path.join(ROOT, file)));
    return { path: file, bytes: bytes.byteLength, sha256: digest(bytes) };
  });

if (!files.some((file) => file.path === "index.html") || !files.some((file) => file.path === "menu.html")) {
  throw new Error("INTEGRITY-001: public entry pages are missing from the manifest input");
}

const manifest = {
  version: 1,
  algorithm: "sha256",
  build,
  files
};
const serialized = `${JSON.stringify(manifest)}\n`;

if (CHECK_MODE) {
  if (!existsSync(OUTPUT)) throw new Error(`INTEGRITY-001: ${OUTPUT} is missing`);
  const committed = readFileSync(OUTPUT, "utf8");
  if (committed !== serialized) {
    // Diagnostics do not relax the gate: list the *actual* divergent public paths
    // so a source/generated mismatch is repaired instead of bypassing integrity.
    try {
      const earlier = JSON.parse(committed);
      const prior = new Map((earlier.files || []).map(file => [file.path, file]));
      const current = new Set(files.map(file => file.path));
      const drifted = files.filter(file => {
        const before = prior.get(file.path);
        return !before || before.sha256 !== file.sha256 || before.bytes !== file.bytes;
      }).map(file => file.path);
      const removed = (earlier.files || []).filter(file => !current.has(file.path)).map(file => file.path);
      console.error("INTEGRITY-001 changed public paths:", JSON.stringify({ drifted, removed, earlierCount: earlier.files?.length, nowCount: files.length }));
      if (drifted.includes("sw-core-v64.js")) {
        try {
          const before = execFileSync("git", ["show", "HEAD:sw-core-v64.js"], {
            encoding: "utf8", timeout: 3000, maxBuffer: 200000
          }).split("\n");
          const after = readFileSync("sw-core-v64.js", "utf8").split("\n");
          const changedLines = [];
          for (let i = 0; i < Math.max(before.length, after.length); i++) {
            if (before[i] === after[i]) continue;
            changedLines.push({ line: i + 1, before: before[i]?.slice(0, 700),
              after: after[i]?.slice(0, 700) });
          }
          console.error("INTEGRITY-001 service-worker build drift:", JSON.stringify(changedLines.slice(0, 12)));
        } catch (error) { console.error("INTEGRITY-001 worker drift inspection unavailable:", String(error)); }
      }
    } catch (error) { console.error("INTEGRITY-001 cannot parse committed manifest:", String(error)); }
    throw new Error(`INTEGRITY-001: ${OUTPUT} is stale. Run npm run integrity:generate and commit the result.`);
  }
  console.log(`✅ INTEGRITY-001 manifest is current: ${files.length} public files, build ${build}.`);
} else {
  writeFileSync(OUTPUT, serialized);
  console.log(`✅ Wrote ${OUTPUT}: ${files.length} public files, build ${build}.`);
}
