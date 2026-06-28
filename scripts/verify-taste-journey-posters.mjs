import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.join("src", "pairings-data");
const FINAL = path.join(ROOT, "final");
const expectedIds = [
  "latte-nutella",
  "iced-san-sebastian",
  "filter-lotus",
  "relax-lotus",
  "cool-lime-macaron"
];
const expectedFiles = expectedIds.map((id) => `${id}.webp.b64.txt`).sort();

function fail(message) {
  throw new Error(`TASTE-POSTER-001: ${message}`);
}

function read24LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function dimensions(buffer) {
  const chunk = buffer.toString("ascii", 12, 16);
  const payload = 20;

  if (chunk === "VP8 ") {
    if (buffer.length < payload + 10 || buffer[payload + 3] !== 0x9d || buffer[payload + 4] !== 0x01 || buffer[payload + 5] !== 0x2a) {
      fail("invalid VP8 frame header");
    }
    return {
      width: buffer.readUInt16LE(payload + 6) & 0x3fff,
      height: buffer.readUInt16LE(payload + 8) & 0x3fff
    };
  }

  if (chunk === "VP8L") {
    if (buffer.length < payload + 5 || buffer[payload] !== 0x2f) fail("invalid VP8L frame header");
    const b1 = buffer[payload + 1];
    const b2 = buffer[payload + 2];
    const b3 = buffer[payload + 3];
    const b4 = buffer[payload + 4];
    return {
      width: 1 + b1 + ((b2 & 0x3f) << 8),
      height: 1 + ((b2 & 0xc0) >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10)
    };
  }

  if (chunk === "VP8X") {
    if (buffer.length < payload + 10) fail("invalid VP8X frame header");
    return {
      width: 1 + read24LE(buffer, payload + 4),
      height: 1 + read24LE(buffer, payload + 7)
    };
  }

  fail(`unsupported WebP chunk ${JSON.stringify(chunk)}`);
}

const rootEntries = readdirSync(ROOT).sort();
if (rootEntries.length !== 1 || rootEntries[0] !== "final") {
  fail(`pairing assets must live only in ${FINAL}; found ${rootEntries.join(", ")}`);
}

const actualFiles = readdirSync(FINAL).sort();
if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
  fail(`expected ${expectedFiles.join(", ")}; found ${actualFiles.join(", ")}`);
}

const seenImages = new Map();
for (const fileName of expectedFiles) {
  const filePath = path.join(FINAL, fileName);
  const payload = readFileSync(filePath, "utf8");
  const base64 = payload.trim();

  if (!base64 || /\s/.test(base64) || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    fail(`${filePath} is not a single valid base64 payload`);
  }

  const image = Buffer.from(base64, "base64");
  if (image.length < 30 || image.toString("ascii", 0, 4) !== "RIFF" || image.toString("ascii", 8, 12) !== "WEBP") {
    fail(`${filePath} does not decode to WebP`);
  }

  const declaredLength = image.readUInt32LE(4) + 8;
  if (declaredLength !== image.length) {
    fail(`${filePath} is truncated: RIFF declares ${declaredLength} bytes, decoded ${image.length}`);
  }

  const { width, height } = dimensions(image);
  if (width !== height || width < 280) {
    fail(`${filePath} must be a square poster of at least 280px, found ${width}x${height}`);
  }

  const digest = createHash("sha256").update(image).digest("hex");
  const duplicate = seenImages.get(digest);
  if (duplicate) fail(`${filePath} duplicates ${duplicate}`);
  seenImages.set(digest, filePath);
}

const source = readFileSync(path.join("src", "discover-rotation.ts"), "utf8");
const runtime = readFileSync("discover-rotation.js", "utf8");
const css = readFileSync("discover-rotation.css", "utf8");

for (const id of expectedIds) {
  if (!source.includes(`posterSource("${id}")`)) fail(`renderer does not map ${id}`);
}

for (const forbidden of ["cloneProductCards", "pairing-composition", "pairing-artwork--warm", "pairing-artwork--fresh"]) {
  if (source.includes(forbidden) || runtime.includes(forbidden) || css.includes(forbidden)) {
    fail(`legacy split-screen token remains: ${forbidden}`);
  }
}

if (!css.includes("object-fit: contain")) fail("posters must render without cropping");
if (/\bfilter\s*:/.test(css)) fail("poster CSS must not recolor final artwork");

console.log(`✅ TASTE-POSTER-001 verified ${expectedFiles.length} unique square WebP posters and the full-poster renderer.`);
