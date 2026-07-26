import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const APPROVED_RED = "#E21B23";
const APPROVED_INK = "#111111";
const APPROVED_PAPER = "#FFFFFF";
const IDENTITY_REVISION = "20260726-approved-v4";
const MARK_VIEWBOX = [0, 0, 184, 211];
const ICON_SIZES = [16, 32, 48, 180, 192, 512];

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
  assert(!/<image\b/i.test(svg), `${path} must not contain embedded raster <image> nodes`);
  assert(!/data:image|base64,/i.test(svg), `${path} must not contain raster or base64 payloads`);
  assert(!/<text\b/i.test(svg), `${path} must not contain font-dependent <text> nodes`);
  assert(!/\bfont-family\s*=/i.test(svg), `${path} must not depend on a font family`);
  assert(/<path\b/i.test(svg), `${path} must contain path geometry`);
}

function extractPathD(svg, id, path) {
  const tag = svg.match(new RegExp(`<path\\b[^>]*\\bid=["']${id}["'][^>]*>`, "i"))?.[0]
    ?? svg.match(new RegExp(`<path\\b[^>]*\\bid=["']${id}["'][^>]*/>`, "i"))?.[0];
  assert(tag, `${path} must expose path #${id}`);
  const d = tag.match(/\bd=[#']([^#']+)[#']/i)?.[1];
  assert(d, `${path} path #${id} must expose d geometry`);
  return d.replace(/\s+/g, " ").trim();
}

function extractWordmark(svg, path) {
  const match = svg.match(/<g id=["']robys-wordmark["'][\s\S]*?<\/g>/);
  assert(match, `${path} must expose the canonical robys-wordmark definition`);
  return match[0].replace(/\s+/g, " ").trim();
}

function iconMargins(svg, path) {
  const match = svg.match(/<g\b[^>]*id=[#']robys-mark["'][^>]*transform=["']translate\(([-\d.]+)\s+([-\d.]+)\)\s+scale\(([-\d.]+)\)["']/i);
  assert(match, `${path} must expose a bounded robys-mark transform`);
  const x = Number(match[1]);
  const y = Number(match[2]);
  const scale = Number(match[3]);
  const width = MARK_VIEWBOX[2] * scale;
  const height = MARK_VIEWBOX[3] * scale;
  return Math.min(x, y, 512 - x - width, 512 - y - height) / 512;
}

const mark = read("src/brand/robys-mark-master-v1.svg");
const organicRing = read("src/brand/robys-organic-ring.svg");
const compact = read("src/brand/robys-compact-master-v1.svg");
const header = read("src/brand/robys-header-master-v1.svg");
const primary = read("src/brand/robys-primary-master-v1.svg");
const icon = read("icon.svg");
const maskable = read("icon-maskable.svg");
const css = read("brand-photo-logo.css");
const baseCss = read("styles.css");
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

for (const [path, source] of [
  ["src/brand/robys-mark-master-v1.svg", mark],
  ["src/brand/robys-organic-ring.svg", organicRing],
  ["src/brand/robys-compact-master-v1.svg", compact],
  ["src/brand/robys-header-master-v1.svg", header],
  ["src/brand/robys-primary-master-v1.svg", primary],
  ["icon.svg", icon],
  ["icon-maskable.svg", maskable]
]) {
  assertPathOnly(source, path);
  assert(source.includes(APPROVED_RED), `${path} must use canonical red ${APPROVED_RED}`);
}

assert(JSON.stringify(viewBox(mark, "src/brand/robys-mark-master-v1.svg")) === JSON.stringify(MARK_VIEWBOX), "mark master must use the approved 184 × 211 canvas");
assert(JSON.stringify(viewBox(organicRing, "src/brand/robys-organic-ring.svg")) === JSON.stringify(MARK_VIEWBOX), "organic ring must use the approved 184 × 211 canvas");
assert(JSON.stringify(viewBox(compact, "src/brand/robys-compact-master-v1.svg")) === JSON.stringify([0, 0, 251, 79]), "compact master must use 251 × 79 canvas");
assert(JSON.stringify(viewBox(header, "src/brand/robys-header-master-v1.svg")) === JSON.stringify([0, 0, 1260, 150]), "header master must use 1260 × 150 canvas");
assert(JSON.stringify(viewBox(primary, "src/brand/robys-primary-master-v1.svg")) === JSON.stringify([0, 0, 1260, 210]), "primary master must use 1260 × 210 canvas");

const markPath = extractPathD(mark, "robys-mark", "src/brand/robys-mark-master-v1.svg");
assert(extractPathD(organicRing, "robys-mark", "src/brand/robys-organic-ring.svg") === markPath, "organic ring must reuse byte-identical Organic O geometry");
for (const [path, source] of [["compact", compact], ["header", header], ["primary", primary]]) {
  assert(extractPathD(source, "robys-o", `${path} master`) === markPath, `${path} must reuse byte-identical Organic O geometry`);
  assert(source.includes('<use href="#robys-wordmark"/>'), `${path} must render the canonical wordmark through <use>`);
}

const canonicalWordmark = extractWordmark(compact, "compact master");
for (const [path, source] of [["header", header], ["primary", primary]]) {
  assert(extractWordmark(source, `${path} master`) === canonicalWordmark, `${path} must reuse byte-identical Roby's glyph geometry`);
}
assert(canonicalWordmark.includes('data-source="owner-approved-identity-sheet-20260726"'), "wordmark must publish the approved-sheet source contract");
assert(canonicalWordmark.includes('data-cap-y="0" data-baseline-y="79"'), "wordmark must publish cap-height and baseline contract");
assert(canonicalWordmark.includes('id="robys-letters"'), "wordmark must expose traced R/B/Y/S geometry");
assert(canonicalWordmark.includes('id="robys-apostrophe"'), "wordmark must expose the red apostrophe geometry");

assert(header.includes('id="coffee-house"'), "header must retain COFFEE HOUSE geometry");
assert(!/id=["']tagline["']|FRESH\s+COFFEE\s+POINT/i.test(header), "header must exclude the micro-tagline");
assert(primary.includes('id="coffee-house"'), "primary must retain COFFEE HOUSE geometry");
assert(primary.includes('id="tagline"'), "primary must retain Fresh Coffee Point tagline geometry");
assert(primary.includes(APPROVED_INK) && compact.includes(APPROVED_INK) && header.includes(APPROVED_INK), "all lockups must use canonical ink");

for (const [path, source, minimum] of [["icon.svg", icon, 0.15], ["icon-maskable.svg", maskable, 0.20]]) {
  assert(source.includes(markPath), `${path} must reuse the approved Organic O path`);
  assert(source.includes(APPROVED_PAPER), `${path} must use pure white ${APPROVED_PAPER}`);
  assert(iconMargins(source, path) >= minimum, `${path} must retain at least ${Math.round(minimum * 100)}% edge clearance`);
}
assert(appleTouchIcon.subarray(1, 4).toString("ascii") === "PNG", "Apple touch icon must remain a PNG");
assert(appleTouchIcon.readUInt32BE(16) === 180 && appleTouchIcon.readUInt32BE(20) === 180, "Apple touch icon must remain 180 × 180 px");
assert(createHash("sha256").update(appleTouchIcon).digest("hex") !== "095279d4874eadaf28febbd35b6da7c1c83073489f7b45b0a93a65daaf4fb6a8", "Apple touch icon must be regenerated for approved v4");

for (const [token, value] of [["--robys-brand-red", APPROVED_RED], ["--robys-brand-ink", APPROVED_INK], ["--robys-brand-paper", APPROVED_PAPER]]) {
  assert(css.includes(`${token}:${value}`), `${token} must publish ${value}`);
}
assert(css.includes(`robys-header-master-v1.svg?v=${IDENTITY_REVISION}`), "desktop header must load approved v4 header");
assert(css.includes(`robys-primary-master-v1.svg?v=${IDENTITY_REVISION}`), "menu lockup must load approved v4 primary");
assert(css.includes(`robys-compact-master-v1.svg?v=${IDENTITY_REVISION}`), "mobile header must load approved v4 compact");
assert(css.includes("border-radius:999px!important"), "mobile header container must preserve the white pill silhouette");
assert(baseCss.includes(`--brand-wordmark-red:${APPROVED_RED}`), "legacy wordmark fallback must use canonical red");
assert(baseCss.includes(`--ruby:${APPROVED_RED}`), "UI ruby token must use canonical red");
assert(!baseCss.includes("#b84d58"), "base UI must not retain legacy ruby red");
assert(!existsSync("src/brand/robys-mobile-master-v1.svg"), "deprecated baked-in mobile pill master must remain removed");

const identityPreloads = new Map([
  ["index.html", `<link rel="preload" href="src/brand/robys-compact-master-v1.svg?v=${IDENTITY_REVISION}" as="image" type="image/svg+xml" media="(max-width: 680px)" fetchpriority="high" />`],
  ["menu.html", `<link rel="preload" href="src/brand/robys-primary-master-v1.svg?v=${IDENTITY_REVISION}" as="image" type="image/svg+xml" fetchpriority="high" />`],
  ["discover.html", `<link rel="preload" href="src/brand/robys-compact-master-v1.svg?v=${IDENTITY_REVISION}" as="image" type="image/svg+xml" media="(max-width: 680px)" fetchpriority="high" />`]
]);
for (const [path, source] of identityPages) {
  assert(source.includes(`brand-photo-logo.css?v=${IDENTITY_REVISION}`), `${path} must link approved v4 identity stylesheet`);
  assert(source.includes(identityPreloads.get(path)), `${path} must preload its approved v4 above-the-fold master`);
  assert(source.includes('<link rel="apple-touch-icon" href="apple-touch-icon.png?v=ios-install-20260707-1" />'), `${path} must keep the static Apple touch link`);
}
assert(serviceWorker.includes(`brand-photo-logo.css?v=${IDENTITY_REVISION}`), "service worker must precache approved v4 stylesheet");
assert(serviceWorker.includes(`robys-header-master-v1.svg?v=${IDENTITY_REVISION}`), "service worker must precache approved v4 header");
assert(serviceWorker.includes('"./icon-maskable.svg"'), "service worker must precache maskable icon");

const manifestIcons = manifest.icons ?? [];
assert(manifestIcons.length === 2, "manifest must publish exactly separate any and maskable icons");
assert(manifestIcons.some((item) => item.src === "icon.svg" && item.purpose === "any" && item.type === "image/svg+xml"), "manifest must publish icon.svg for purpose any");
assert(manifestIcons.some((item) => item.src === "icon-maskable.svg" && item.purpose === "maskable" && item.type === "image/svg+xml"), "manifest must publish dedicated maskable icon");

for (const [path, source] of serviceIdentityPages) {
  assert(source.includes("../apple-touch-icon.png?v=ios-install-20260707-1"), `${path} must retain Apple touch icon`);
  assert(!/class=["']brand-mark[#'][^>]*>\s*R\s*</i.test(source), `${path} must not render legacy R badge`);
  assert(/robys-(?:compact|mark)-master-v1\.svg/.test(source), `${path} must reuse an approved SVG identity asset`);
}
for (const [path, source] of serviceIdentityStyles) {
  assert(source.includes(APPROVED_RED), `${path} must use canonical red`);
  assert(!source.includes("#b84d58"), `${path} must not retain legacy ruby red`);
  assert(!/Georgia|Times New Roman|(?<!sans-)\bserif\b/i.test(source), `${path} must not introduce serif display language`);
}
assert(notFoundHtml.includes("src/brand/robys-mark-master-v1.svg"), "404 page must reuse the approved Organic O mark");
assert(!/class=["']offline-mark["'][^>]*>\s*R\s*</i.test(notFoundHtml), "404 page must not render legacy R badge");
assert(offlineCss.includes(APPROVED_RED) && !offlineCss.includes("#b84d58"), "404 UI must use canonical red");

for (const size of ICON_SIZES) {
  assert(Math.round(iconMargins(icon, "icon.svg") * size * 100) / 100 > 0, `${size}px any icon must retain visible clearance`);
  assert(Math.round(iconMargins(maskable, "icon-maskable.svg") * size * 100) / 100 > 0, `${size}px maskable icon must retain visible clearance`);
}

console.log(`✅ BRAND-IDENTITY-001: owner-approved ${IDENTITY_REVISION} is path-only, white-backed, canonically shared, statically delivered and cache-revisioned.`);
