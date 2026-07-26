import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const ROOT = "qa/brand/candidate";
const files = {
  mark: `${ROOT}/robys-organic-o-v4.svg`,
  compact: `${ROOT}/robys-compact-v4.svg`,
  header: `${ROOT}/robys-header-v4.svg`,
  primary: `${ROOT}/robys-primary-v4.svg`
};
const read = (path) => readFileSync(path, "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(`[ROBYs-IDENTITY-V4] ${message}`); };
const sources = Object.fromEntries(Object.entries(files).map(([key,path]) => [key, read(path)]));

for (const [key, source] of Object.entries(sources)) {
  assert(source.includes("#E21B23"), `${key} must use approved red`);
  assert(!/<image\b/i.test(source), `${key} must not contain <image>`);
  assert(!/data:image|base64/i.test(source), `${key} must not embed raster data`);
  assert(!/<text\b/i.test(source), `${key} must not contain font-dependent <text>`);
  assert(/<path\b/i.test(source), `${key} must contain vector path geometry`);
}

const viewBox = (source) => source.match(/viewBox="([^"]+)"/)?.[1];
assert(viewBox(sources.mark) === "0 0 184 211", "Organic O viewBox changed");
assert(viewBox(sources.compact) === "0 0 251 79", "Compact viewBox changed");
assert(viewBox(sources.header) === "0 0 1260 150", "Header viewBox changed");
assert(viewBox(sources.primary) === "0 0 1260 210", "Primary viewBox changed");

const wordmark = (source) => source.match(/<g id="robys-wordmark"[\s\S]*?<\/g>/)?.[0].replace(/\s+/g," ").trim();
const canonical = wordmark(sources.compact);
assert(canonical, "Compact must expose canonical robys-wordmark");
assert(wordmark(sources.header) === canonical, "Header must reuse byte-identical canonical wordmark");
assert(wordmark(sources.primary) === canonical, "Primary must reuse byte-identical canonical wordmark");
for (const key of ["compact","header","primary"]) {
  assert(sources[key].includes('<use href="#robys-wordmark"/>'), `${key} must render wordmark through <use>`);
}

const markPath = sources.mark.match(/id="robys-mark"[^>]*d="([^"]+)"/)?.[1];
assert(markPath, "Organic O must expose robys-mark path");
assert(canonical.includes(markPath), "Canonical wordmark must reuse the Organic O path exactly");
assert(canonical.includes('transform="translate(40 0) scale(.374407583)"'), "Organic O compact transform changed");
assert(canonical.includes('data-source="owner-approved-identity-sheet-20260726"'), "Source-of-truth marker missing");
assert(sources.primary.includes('id="tagline"'), "Primary must retain tagline geometry");
assert(!sources.header.includes('id="tagline"'), "Header must not contain micro-tagline");

const digest = (source) => createHash("sha256").update(source).digest("hex");
console.log("✅ ROBYs-IDENTITY-V4 candidate structure passed");
for (const [key, source] of Object.entries(sources)) {
  console.log(`${key}: ${Buffer.byteLength(source)} bytes sha256:${digest(source)}`);
}
