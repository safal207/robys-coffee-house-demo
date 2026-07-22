import { readFileSync } from "node:fs";

const APPROVED_RED = "#E21B23";
const APPROVED_INK = "#111111";
const APPROVED_PAPER = "#F5F5F2";
const IDENTITY_REVISION = "20260723-identity-v1";
const ICON_SIZES = [16, 32, 48, 192, 512];

function read(path) {
  return readFileSync(path, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(`[BRAND-IDENTITY-001] ${message}`);
}

function viewBox(svg, path) {
  const match = svg.match(/\bviewBox=["']([^"']+)["']/i);
  assert(match, `${path} must declare a viewBox`);
  const values = match[1].trim().split(/\s+/).map(Number);
  assert(values.length === 4 && values.every(Number.isFinite), `${path} has an invalid viewBox`);
  return values;
}

function assertPathOnly(svg, path) {
  assert(!/<text\b/i.test(svg), `${path} must not contain font-dependent <text> nodes`);
  assert(!/\bfont-family\s*=/i.test(svg), `${path} must not depend on a font family`);
  assert(/<path\b/i.test(svg), `${path} must contain path geometry`);
}

function extractTransform(svg, path) {
  const match = svg.match(/<g\b[^>]*id=["']robys-mark["'][^>]*transform=["']translate\(([\d.]+)\s+([\d.]+)\)\s+scale\(([\d.]+)\)["']/i);
  assert(match, `${path} must expose the bounded robys-mark transform`);
  return { x: Number(match[1]), y: Number(match[2]), scale: Number(match[3]) };
}

function safeMargins(svg, path) {
  const { x, y, scale } = extractTransform(svg, path);
  const outerMin = 4;
  const outerMax = 96;
  const left = x + outerMin * scale;
  const top = y + outerMin * scale;
  const right = 512 - (x + outerMax * scale);
  const bottom = 512 - (y + outerMax * scale);
  return Math.min(left, top, right, bottom) / 512;
}

const mark = read("src/brand/robys-mark-master-v1.svg");
const header = read("src/brand/robys-header-master-v1.svg");
const primary = read("src/brand/robys-primary-master-v1.svg");
const compact = read("src/brand/robys-compact-master-v1.svg");
const icon = read("icon.svg");
const maskable = read("icon-maskable.svg");
const css = read("brand-photo-logo.css");
const bootstrap = read("bootstrap.js");
const serviceWorker = read("sw.js");
const manifest = JSON.parse(read("manifest.webmanifest"));

for (const [path, source] of [
  ["src/brand/robys-mark-master-v1.svg", mark],
  ["src/brand/robys-header-master-v1.svg", header],
  ["src/brand/robys-primary-master-v1.svg", primary],
  ["src/brand/robys-compact-master-v1.svg", compact],
  ["icon.svg", icon],
  ["icon-maskable.svg", maskable]
]) {
  assertPathOnly(source, path);
}

assert(JSON.stringify(viewBox(header, "src/brand/robys-header-master-v1.svg")) === JSON.stringify([0, 0, 1260, 150]), "medium header master must use the approved 1260 × 150 canvas");
assert(!/FRESH\s+COFFEE\s+POINT/i.test(header), "medium header master must not contain the micro-tagline");
assert(header.includes(APPROVED_RED) && header.includes(APPROVED_INK), "medium header master must use canonical red and ink");
assert(icon.includes(APPROVED_RED) && icon.includes(APPROVED_PAPER), "favicon must use canonical red and paper");
assert(maskable.includes(APPROVED_RED) && maskable.includes(APPROVED_PAPER), "maskable icon must use canonical red and paper");

const markPath = mark.match(/<path\b[^>]*\bd=["']([^"']+)["']/i)?.[1];
assert(markPath, "approved mark master must expose one path");
assert(icon.includes(markPath), "favicon must reuse the approved organic O path");
assert(maskable.includes(markPath), "maskable icon must reuse the approved organic O path");
assert(header.includes(markPath), "header wordmark must reuse the approved organic O path");

assert(safeMargins(icon, "icon.svg") >= 0.15, "favicon mark must retain at least 15% edge clearance");
assert(safeMargins(maskable, "icon-maskable.svg") >= 0.20, "maskable icon must retain at least 20% edge clearance");

const manifestIcons = manifest.icons ?? [];
assert(manifestIcons.length === 2, "manifest must publish exactly separate any and maskable icons");
assert(manifestIcons.some((item) => item.src === "icon.svg" && item.purpose === "any" && item.type === "image/svg+xml"), "manifest must publish icon.svg for purpose any");
assert(manifestIcons.some((item) => item.src === "icon-maskable.svg" && item.purpose === "maskable" && item.type === "image/svg+xml"), "manifest must publish a dedicated maskable icon");
assert(!manifestIcons.some((item) => /\bany\s+maskable\b/.test(item.purpose ?? "")), "manifest must not reuse one asset for both any and maskable purposes");

for (const [token, value] of [
  ["--robys-brand-red", APPROVED_RED],
  ["--robys-brand-ink", APPROVED_INK],
  ["--robys-brand-paper", APPROVED_PAPER]
]) {
  assert(css.includes(`${token}:${value}`), `${token} must publish ${value}`);
}

assert(css.includes(`robys-header-master-v1.svg?v=${IDENTITY_REVISION}`), "desktop header must load the no-tagline medium master");
assert(css.includes("robys-primary-master-v1.svg?v=20260721-master-1"), "large menu lockup must retain the primary master");
assert(css.includes("robys-compact-master-v1.svg?v=20260721-master-1"), "mobile header must retain the compact master");
assert(bootstrap.includes(`brand-photo-logo.css?v=${IDENTITY_REVISION}`), "bootstrap must deliver the exact identity stylesheet revision");
assert(bootstrap.includes("apple-touch-icon.png?v="), "Apple touch icon PNG wiring must remain active");
assert(serviceWorker.includes(`brand-photo-logo.css?v=${IDENTITY_REVISION}`), "service worker must precache the exact identity stylesheet revision");
assert(serviceWorker.includes(`robys-header-master-v1.svg?v=${IDENTITY_REVISION}`), "service worker must precache the exact header master revision");
assert(serviceWorker.includes('"./icon-maskable.svg"'), "service worker must precache the dedicated maskable icon");
assert(serviceWorker.includes('endsWith("/src/brand/robys-header-master-v1.svg")'), "header master must use exact-revision cache matching");

for (const size of ICON_SIZES) {
  const scaledAnyMargin = Math.round(safeMargins(icon, "icon.svg") * size * 100) / 100;
  const scaledMaskableMargin = Math.round(safeMargins(maskable, "icon-maskable.svg") * size * 100) / 100;
  assert(scaledAnyMargin > 0 && scaledMaskableMargin > 0, `${size}px icon geometry must retain visible edge clearance`);
}

console.log(`✅ BRAND-IDENTITY-001: canonical Roby's identity is path-only, split for any/maskable, and bounded at ${ICON_SIZES.join(", ")} px.`);
