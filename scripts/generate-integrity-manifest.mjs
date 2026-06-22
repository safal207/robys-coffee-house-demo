import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

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
  ".png",
  ".svg",
  ".txt",
  ".webmanifest",
  ".webp",
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
    const bytes = readFileSync(path.join(ROOT, file));
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
const serialized = `${JSON.stringify(manifest, null, 2)}\n`;

if (CHECK_MODE) {
  if (!existsSync(OUTPUT)) throw new Error(`INTEGRITY-001: ${OUTPUT} is missing`);
  const committed = readFileSync(OUTPUT, "utf8");
  if (committed !== serialized) {
    throw new Error(`INTEGRITY-001: ${OUTPUT} is stale. Run npm run integrity:generate and commit the result.`);
  }
  console.log(`✅ INTEGRITY-001 manifest is current: ${files.length} public files, build ${build}.`);
} else {
  writeFileSync(OUTPUT, serialized);
  console.log(`✅ Wrote ${OUTPUT}: ${files.length} public files, build ${build}.`);
}
