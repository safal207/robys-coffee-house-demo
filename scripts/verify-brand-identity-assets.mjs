import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const APPROVED_RED = "#E21B23";
const APPROVED_INK = "#111111";
const APPROVED_PAPER = "#F5F5F2";
const IDENTITY_REVISION = "20260723-identity-v2";
const ICON_SIZES = [16, 32, 48, 192, 512];
const APPLE_TOUCH_ICON_SHA256 = "095279d4874eadaf28febbd35b6da7c1c83073489f7b45b0a93a65daaf4fb6a8";

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
const baseCss = read("styles.css");
const organicRing = read("src/brand/robys-organic-ring.svg");
const bootstrap = read("bootstrap.js");
const serviceWorker = read("sw.js");
const manifest = JSON.parse(read("manifest.webmanifest"));
const appleTouchIcon = readFileSync("apple-touch-icon.png");
const identityPages = ["index.html", "menu.html", "discover.html"].map((path) => [path, read(path)]);
const serviceIdentityPages = [
  ["docs/instagram-tools.html", read("docs/instagram-tools.html")],
  ["docs/owner-pitch.html", read("docs/owner-pitch.html")]
];
const serviceIdentityStyles = [
  ["docs/instagram-tools.css", read("docs/instagram-tools.css")],
  ["docs/owner-pitch.css", read("docs/owner-pitch.css")]
];
const notFoundHtml = read("404.html");
const offlineCss = read("offline.css");
const identityPreloads = new Map([
  ["index.html", '<link rel="preload" href="src/brand/robys-compact-master-v1.svg?v=20260721-master-1" as="image" type="image/svg+xml" media="(max-width: 680px)" fetchpriority="high" />'],
  ["menu.html", '<link rel="preload" href="src/brand/robys-primary-master-v1.svg?v=20260721-master-1" as="image" type="image/svg+xml" fetchpriority="high" />'],
  ["discover.html", '<link rel="preload" href="src/brand/robys-compact-master-v1.svg?v=20260721-master-1" as="image" type="image/svg+xml" media="(max-width: 680px)" fetchpriority="high" />']
]);

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
assert(appleTouchIcon.subarray(1, 4).toString("ascii") === "PNG", "Apple touch icon must remain a PNG");
assert(appleTouchIcon.readUInt32BE(16) === 180 && appleTouchIcon.readUInt32BE(20) === 180, "Apple touch icon must remain 180 × 180 px");
assert(createHash("sha256").update(appleTouchIcon).digest("hex") === APPLE_TOUCH_ICON_SHA256, "Apple touch icon must remain bound to the approved organic O export");

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
assert(css.includes("border-radius:999px!important"), "mobile header container must preserve the approved pill silhouette");
assert(css.includes("robys-primary-master-v1.svg?v=20260721-master-1"), "large menu lockup must retain the primary master");
assert(css.includes("robys-compact-master-v1.svg?v=20260721-master-1"), "mobile header must retain the compact master");
assert(baseCss.includes(`--brand-wordmark-red:${APPROVED_RED}`), "legacy wordmark fallback must use canonical red");
assert(baseCss.includes(`--ruby:${APPROVED_RED}`), "UI ruby token must use canonical red");
assert(!baseCss.includes("#b84d58"), "base UI must not retain the legacy ruby red");
assert(!existsSync("src/brand/robys-mobile-master-v1.svg"), "deprecated baked-in mobile pill master must be removed");
assert(organicRing.includes(APPROVED_RED), "organic ring must use canonical red");
assert(!organicRing.includes("#d32636"), "organic ring must not retain the legacy red");
for (const [path, source] of identityPages) {
  assert(source.includes(`brand-photo-logo.css?v=${IDENTITY_REVISION}`), `${path} must link the identity stylesheet without JavaScript`);
  assert(source.includes('<link rel="apple-touch-icon" href="apple-touch-icon.png?v=ios-install-20260707-1" />'), `${path} must statically link the Apple touch icon`);
  const preload = identityPreloads.get(path);
  assert(
    source.includes(preload),
    `${path} must preload its above-the-fold identity master`
  );
}
assert(!bootstrap.includes("brand-photo-logo.css"), "bootstrap must not inject the identity stylesheet at runtime");
assert(bootstrap.includes("apple-touch-icon.png?v="), "progressive Apple touch fallback may remain active");
for (const [path, source] of serviceIdentityPages) {
  assert(source.includes("../apple-touch-icon.png?v=ios-install-20260707-1"), `${path} must statically link the Apple touch icon`);
  assert(!/class=["']brand-mark["'][^>]*>\s*R\s*</i.test(source), `${path} must not render the legacy R badge`);
  assert(/robys-(?:compact|mark)-master-v1\.svg/.test(source), `${path} must reuse an approved SVG identity asset`);
}
for (const [path, source] of serviceIdentityStyles) {
  assert(source.includes(APPROVED_RED), `${path} must use canonical red`);
  assert(!source.includes("#b84d58"), `${path} must not retain the legacy ruby red`);
  assert(!/Georgia|Times New Roman|(?<!sans-)\bserif\b/i.test(source), `${path} must not introduce a serif display language`);
}
assert(notFoundHtml.includes("apple-touch-icon.png?v=ios-install-20260707-1"), "404 page must statically link the Apple touch icon");
assert(notFoundHtml.includes("src/brand/robys-mark-master-v1.svg"), "404 page must reuse the approved organic-O mark");
assert(!/class=["']offline-mark["'][^>]*>\s*R\s*</i.test(notFoundHtml), "404 page must not render the legacy R badge");
assert(offlineCss.includes(APPROVED_RED) && !offlineCss.includes("#b84d58"), "404 UI must use canonical red");
assert(!/Georgia|Times New Roman|(?<!sans-)\bserif\b/i.test(offlineCss), "404 UI must not introduce a serif display language");
assert(/^const CACHE_VERSION = "robys-offline-[^"]+-[a-f0-9]{12}-[a-f0-9]{12}-[a-f0-9]{12}";/m.test(serviceWorker), "service worker cache version must remain compatible with the deterministic build rewriter");
assert(serviceWorker.includes(`brand-photo-logo.css?v=${IDENTITY_REVISION}`), "service worker must precache the exact identity stylesheet revision");
assert(serviceWorker.includes(`robys-header-master-v1.svg?v=${IDENTITY_REVISION}`), "service worker must precache the exact header master revision");
assert(serviceWorker.includes('"./icon-maskable.svg"'), "service worker must precache the dedicated maskable icon");
assert(serviceWorker.includes('endsWith("/src/brand/robys-header-master-v1.svg")'), "header master must use exact-revision cache matching");

for (const size of ICON_SIZES) {
  const scaledAnyMargin = Math.round(safeMargins(icon, "icon.svg") * size * 100) / 100;
  const scaledMaskableMargin = Math.round(safeMargins(maskable, "icon-maskable.svg") * size * 100) / 100;
  assert(scaledAnyMargin > 0 && scaledMaskableMargin > 0, `${size}px icon geometry must retain visible edge clearance`);
}

console.log(`✅ BRAND-IDENTITY-001: canonical Roby's identity is path-only, platform-aligned, split for any/maskable, and bounded at ${ICON_SIZES.join(", ")} px.`);
