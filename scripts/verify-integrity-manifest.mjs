import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";

const manifestPath = "integrity-manifest.json";
if (!existsSync(manifestPath)) throw new Error(`INTEGRITY-001: ${manifestPath} is missing`);

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (manifest.version !== 1 || manifest.algorithm !== "sha256") {
  throw new Error("INTEGRITY-001: unsupported manifest version or algorithm");
}
if (!Array.isArray(manifest.files) || manifest.files.length < 10) {
  throw new Error("INTEGRITY-001: manifest file list is unexpectedly small");
}

const paths = manifest.files.map((entry) => entry.path);
if (new Set(paths).size !== paths.length) throw new Error("INTEGRITY-001: duplicate paths in manifest");
if (!paths.includes("index.html") || !paths.includes("menu.html")) {
  throw new Error("INTEGRITY-001: public entry pages are not protected");
}

const failures = [];
for (const entry of manifest.files) {
  if (!/^[a-zA-Z0-9._/-]+$/.test(entry.path) || entry.path.startsWith("/") || entry.path.includes("..")) {
    failures.push(`${entry.path}: unsafe manifest path`);
    continue;
  }
  if (!existsSync(entry.path) || !statSync(entry.path).isFile()) {
    failures.push(`${entry.path}: missing file`);
    continue;
  }
  const bytes = readFileSync(entry.path);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== entry.bytes) failures.push(`${entry.path}: size ${bytes.byteLength} != ${entry.bytes}`);
  if (sha256 !== entry.sha256) failures.push(`${entry.path}: sha256 ${sha256} != ${entry.sha256}`);
}

const indexBuild = readFileSync("index.html", "utf8").match(/<meta\b[^>]*name=["']robys-build["'][^>]*content=["']([^"']+)["']/i)?.[1];
const menuBuild = readFileSync("menu.html", "utf8").match(/<meta\b[^>]*name=["']robys-build["'][^>]*content=["']([^"']+)["']/i)?.[1];
if (!indexBuild || indexBuild !== menuBuild || indexBuild !== manifest.build) {
  failures.push(`build marker mismatch: index=${indexBuild}, menu=${menuBuild}, manifest=${manifest.build}`);
}

if (failures.length) {
  failures.forEach((failure) => console.error(`❌ [INTEGRITY-001] ${failure}`));
  throw new Error(`INTEGRITY-001 failed: ${failures.length} mismatch(es)`);
}

console.log(`✅ INTEGRITY-001 passed: ${manifest.files.length} public files match build ${manifest.build}.`);
