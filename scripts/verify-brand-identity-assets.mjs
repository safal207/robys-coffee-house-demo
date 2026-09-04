import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const RED = "#E21B23";
const INK = "#111111";
const WHITE = "#FFFFFF";
const REVISION = "20260726-approved-v4";
const OLD_REVISION = "20260724-wordmark-v3";
const MARK_BOX = [0, 0, 184, 211];

const read = (path) => readFileSync(path, "utf8");
const fail = (message) => { throw new Error(`[BRAND-IDENTITY-001] ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };

function viewBox(svg, path) {
  const value = svg.match(/viewBox="([^"]+)"/i)?.[1];
  assert(value, `${path} must declare a double-quoted viewBox`);
  const numbers = value.trim().split(/\s+/).map(Number);
  assert(numbers.length === 4 && numbers.every(Number.isFinite), `${path} has an invalid viewBox`);
  return numbers;
}

function pathTag(svg, id, path) {
  const pattern = new RegExp(`<path\\b[^>]*\\bid="${id}"[^>]*\\/?>`, "i");
  const tag = svg.match(pattern)?.[0];
  assert(tag, `${path} must expose path #${id}`);
  return tag;
}

function pathD(svg, id, path) {
  const value = pathTag(svg, id, path).match(/\bd="([^"]+)"/i)?.[1];
  assert(value, `${path} path #${id} must expose d geometry`);
  return value.replace(/\s+/g, " ").trim();
}

function wordmark(svg, path) {
  const group = svg.match(/<g id="robys-wordmark"[\s\S]*?<\/g>/)?.[0];
  assert(group, `${path} must expose canonical robys-wordmark`);
  return group.replace(/\s+/g, " ").trim();
}

function assertVector(svg, path) {
  assert(/<path\b/i.test(svg), `${path} must contain path geometry`);
  assert(!/<image\b/i.test(svg), `${path} must not contain <image>`);
  assert(!/data:image|base64,/i.test(svg), `${path} must not contain raster/base64 payloads`);
  assert(!/<text\b|font-family\s*=/i.test(svg), `${path} must not depend on fonts or <text>`);
  assert(svg.includes(RED), `${path} must use ${RED}`);
}

function iconClearance(svg, path) {
  const match = svg.match(/<g[^>]*id="robys-mark"[^>]*transform="translate\(([-\d.]+)\s+([-\d.]+)\)\s+scale\(([-\d.]+)\)"/i);
  assert(match, `${path} must expose a bounded robys-mark transform`);
  const x = Number(match[1]);
  const y = Number(match[2]);
  const scale = Number(match[3]);
  return Math.min(x, y, 512 - x - MARK_BOX[2] * scale, 512 - y - MARK_BOX[3] * scale) / 512;
}

const paths = {
  mark: "src/brand/robys-mark-master-v1.svg",
  ring: "src/brand/robys-organic-ring.svg",
  compact: "src/brand/robys-compact-master-v1.svg",
  header: "src/brand/robys-header-master-v1.svg",
  primary: "src/brand/robys-primary-master-v1.svg",
  icon: "icon.svg",
  maskable: "icon-maskable.svg"
};
const assets = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, read(path)]));
for (const [key, source] of Object.entries(assets)) assertVector(source, paths[key]);

assert(JSON.stringify(viewBox(assets.mark, paths.mark)) === JSON.stringify(MARK_BOX), "mark must use 184 × 211 canvas");
assert(JSON.stringify(viewBox(assets.ring, paths.ring)) === JSON.stringify(MARK_BOX), "ring must use 184 × 211 canvas");
assert(JSON.stringify(viewBox(assets.compact, paths.compact)) === JSON.stringify([0, 0, 251, 79]), "compact must use 251 × 79 canvas");
assert(JSON.stringify(viewBox(assets.header, paths.header)) === JSON.stringify([0, 0, 1260, 150]), "header must use 1260 × 150 canvas");
assert(JSON.stringify(viewBox(assets.primary, paths.primary)) === JSON.stringify([0, 0, 1260, 210]), "primary must use 1260 × 210 canvas");

const mark = pathD(assets.mark, "robys-mark", paths.mark);
assert(pathD(assets.ring, "robys-mark", paths.ring) === mark, "supporting ring must reuse canonical Organic O");
for (const key of ["compact", "header", "primary"]) {
  assert(pathD(assets[key], "robys-o", paths[key]) === mark, `${key} must reuse canonical Organic O`);
  assert(assets[key].includes('<use href="#robys-wordmark"/>'), `${key} must render canonical wordmark through <use>`);
}
const canonical = wordmark(assets.compact, paths.compact);
for (const key of ["header", "primary"]) assert(wordmark(assets[key], paths[key]) === canonical, `${key} must reuse byte-identical wordmark geometry`);
assert(canonical.includes('data-source="owner-approved-identity-sheet-20260726"'), "wordmark must declare approved identity sheet source");
assert(canonical.includes('data-cap-y="0" data-baseline-y="79"'), "wordmark must declare cap and baseline contract");
assert(canonical.includes('id="robys-letters"') && canonical.includes('id="robys-apostrophe"'), "wordmark must expose traced letters and apostrophe");
assert(assets.header.includes('id="coffee-house"') && !assets.header.includes('id="tagline"'), "header must contain COFFEE HOUSE without tagline");
assert(assets.primary.includes('id="coffee-house"') && assets.primary.includes('id="tagline"'), "primary must contain COFFEE HOUSE and tagline");
assert([assets.compact, assets.header, assets.primary].every((source) => source.includes(INK)), `lockups must use ${INK}`);

for (const [key, minimum] of [["icon", 0.15], ["maskable", 0.20]]) {
  assert(assets[key].includes(mark), `${paths[key]} must reuse canonical Organic O`);
  assert(assets[key].includes(WHITE), `${paths[key]} must use pure white background`);
  assert(iconClearance(assets[key], paths[key]) >= minimum, `${paths[key]} must retain ${minimum * 100}% safe clearance`);
}

const apple = readFileSync("apple-touch-icon.png");
assert(apple.subarray(1, 4).toString("ascii") === "PNG", "Apple touch icon must remain PNG");
assert(apple.readUInt32BE(16) === 180 && apple.readUInt32BE(20) === 180, "Apple touch icon must remain 180 × 180");
assert(createHash("sha256").update(apple).digest("hex") !== "095279d4874eadaf28febbd35b6da7c1c83073489f7b45b0a93a65daaf4fb6a8", "Apple touch icon must be regenerated for v4");

const css = read("brand-photo-logo.css");
for (const [token, value] of [["--robys-brand-red", RED], ["--robys-brand-ink", INK], ["--robys-brand-paper", WHITE]]) {
  assert(css.includes(`${token}:${value}`), `${token} must publish ${value}`);
}
for (const asset of ["robys-compact-master-v1.svg", "robys-header-master-v1.svg", "robys-primary-master-v1.svg"]) {
  assert(css.includes(`${asset}?v=${REVISION}`), `stylesheet must load ${asset} at ${REVISION}`);
}
assert(css.includes("border-radius:999px!important") && css.includes("box-shadow:0 10px 26px rgba(17,17,17,.16)!important"), "mobile shell must retain approved white pill treatment");
assert(!css.includes(OLD_REVISION), "stylesheet must not retain old identity revision");

const preloads = new Map([
  ["index.html", `src/brand/robys-compact-master-v1.svg?v=${REVISION}`],
  ["menu.html", `src/brand/robys-primary-master-v1.svg?v=${REVISION}`],
  ["discover.html", `src/brand/robys-compact-master-v1.svg?v=${REVISION}`]
]);
for (const [path, preload] of preloads) {
  const html = read(path);
  assert(html.includes(`brand-photo-logo.css?v=${REVISION}`), `${path} must link v4 stylesheet`);
  assert(html.includes(preload), `${path} must preload v4 lockup`);
  assert(!html.includes(OLD_REVISION), `${path} must not retain old identity revision`);
}
const sw = read("sw.js");
assert(sw.includes(`brand-photo-logo.css?v=${REVISION}`), "service worker must precache v4 stylesheet");
assert(sw.includes(`robys-header-master-v1.svg?v=${REVISION}`), "service worker must precache v4 header");
assert(!sw.includes(OLD_REVISION), "service worker must not retain old identity revision");

const manifest = JSON.parse(read("manifest.webmanifest"));
assert((manifest.icons ?? []).some((item) => item.src === "icon.svg" && item.purpose === "any"), "manifest must publish any icon");
assert((manifest.icons ?? []).some((item) => item.src === "icon-maskable.svg" && item.purpose === "maskable"), "manifest must publish maskable icon");
assert(!existsSync("src/brand/robys-mobile-master-v1.svg"), "deprecated baked-in mobile SVG must remain absent");

const baseCss = read("styles-v2.css");
assert(baseCss.includes(`--brand-wordmark-red:${RED}`) && baseCss.includes(`--ruby:${RED}`), "base UI tokens must retain canonical red");
assert(!baseCss.includes("#b84d58"), "base UI must not retain legacy red");
for (const path of ["docs/instagram-tools.html", "docs/owner-pitch.html", "404.html"]) {
  const source = read(path);
  assert(/robys-(?:compact|mark)-master-v1\.svg/.test(source), `${path} must reuse an approved identity SVG`);
}
for (const path of ["docs/instagram-tools.css", "docs/owner-pitch.css", "offline.css"]) {
  const source = read(path);
  assert(source.includes(RED) && !source.includes("#b84d58"), `${path} must retain canonical red`);
}

console.log(`✅ BRAND-IDENTITY-001: ${REVISION} is path-only, white-backed, canonically shared, statically delivered and cache-revisioned.`);
