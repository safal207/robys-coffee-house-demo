import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.join("src", "pairings-data");
const FINAL = path.join(ROOT, "final");
const EXPECTED_IDS = [
  "latte-nutella",
  "iced-san-sebastian",
  "filter-lotus",
  "relax-lotus",
  "cool-lime-macaron"
];
const ACTIVE_IDS = ["cool-lime-macaron", "iced-san-sebastian"];
const EXPECTED_FILES = EXPECTED_IDS.map((id) => `${id}.webp.b64.txt`).sort();
const fail = (message) => { throw new Error(`TASTE-POSTER-001: ${message}`); };
const read24LE = (buffer, offset) => buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);

function dimensions(buffer) {
  const chunk = buffer.toString("ascii", 12, 16);
  const payload = 20;
  if (chunk === "VP8 ") {
    if (buffer.length < payload + 10 || buffer[payload + 3] !== 0x9d || buffer[payload + 4] !== 0x01 || buffer[payload + 5] !== 0x2a) fail("invalid VP8 frame header");
    return { width: buffer.readUInt16LE(payload + 6) & 0x3fff, height: buffer.readUInt16LE(payload + 8) & 0x3fff };
  }
  if (chunk === "VP8L") {
    if (buffer.length < payload + 5 || buffer[payload] !== 0x2f) fail("invalid VP8L frame header");
    const [b1, b2, b3, b4] = buffer.subarray(payload + 1, payload + 5);
    return { width: 1 + b1 + ((b2 & 0x3f) << 8), height: 1 + ((b2 & 0xc0) >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10) };
  }
  if (chunk === "VP8X") {
    if (buffer.length < payload + 10) fail("invalid VP8X frame header");
    return { width: 1 + read24LE(buffer, payload + 4), height: 1 + read24LE(buffer, payload + 7) };
  }
  fail(`unsupported WebP chunk ${JSON.stringify(chunk)}`);
}

const rootEntries = readdirSync(ROOT).sort();
if (rootEntries.length !== 1 || rootEntries[0] !== "final") fail(`pairing assets must live only in ${FINAL}; found ${rootEntries.join(", ")}`);
const actualFiles = readdirSync(FINAL).sort();
if (JSON.stringify(actualFiles) !== JSON.stringify(EXPECTED_FILES)) fail(`expected ${EXPECTED_FILES.join(", ")}; found ${actualFiles.join(", ")}`);

const seen = new Map();
for (const fileName of EXPECTED_FILES) {
  const filePath = path.join(FINAL, fileName);
  const base64 = readFileSync(filePath, "utf8").trim();
  if (!base64 || /\s/.test(base64) || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) fail(`${filePath} is not a single valid base64 payload`);
  const image = Buffer.from(base64, "base64");
  if (image.length < 30 || image.toString("ascii", 0, 4) !== "RIFF" || image.toString("ascii", 8, 12) !== "WEBP") fail(`${filePath} does not decode to WebP`);
  const declaredLength = image.readUInt32LE(4) + 8;
  if (declaredLength !== image.length) fail(`${filePath} is truncated: RIFF declares ${declaredLength} bytes, decoded ${image.length}`);
  const { width, height } = dimensions(image);
  if (width !== height || width < 280) fail(`${filePath} must be a square poster of at least 280px, found ${width}x${height}`);
  const digest = createHash("sha256").update(image).digest("hex");
  if (seen.has(digest)) fail(`${filePath} duplicates ${seen.get(digest)}`);
  seen.set(digest, filePath);
}

const source = readFileSync(path.join("src", "discover-rotation.ts"), "utf8");
const runtime = readFileSync("discover-rotation-v2.js", "utf8");
const discoverRuntime = readFileSync("discover-v2.js", "utf8");
const journeysSource = readFileSync("discover-journeys-v2.js", "utf8");
const compatibilityGuard = readFileSync("discover-weather-guard.js", "utf8");
const serviceWorker = readFileSync("sw.js", "utf8");
const css = readFileSync("discover-rotation.css", "utf8");
const html = readFileSync("discover.html", "utf8");

for (const [label, text] of [["source", source], ["runtime", runtime]]) {
  for (const id of EXPECTED_IDS) {
    if (!text.includes(`posterSource("${id}")`)) fail(`${label} renderer does not map ${id}`);
    if (!text.includes(`"${id}": {`)) fail(`${label} renderer is not keyed by journey id ${id}`);
  }
}

const journeysBlock = journeysSource.match(/export const journeys\s*=\s*\[([\s\S]*?)\n\];\s*\n\s*export const imageAlt/)?.[1];
if (!journeysBlock) fail("could not isolate the exported journeys array");
const actualIds = [...journeysBlock.matchAll(/^\s{4}id:\s*"([^"]+)"/gm)].map((match) => match[1]);
if (JSON.stringify(actualIds) !== JSON.stringify(ACTIVE_IDS)) fail(`discover page must expose only ${ACTIVE_IDS.join(", ")}; found ${actualIds.join(", ")}`);

if (!journeysSource.includes('const ACTIVE_PAIRING_IDS = ["cool-lime-macaron", "iced-san-sebastian"];')) fail("journey guard must allow only the two active pairing IDs");
if (!journeysSource.includes("new Set(ACTIVE_PAIRING_IDS)")) fail("journey guard does not use the active pairing allowlist");
if (!discoverRuntime.includes('from"./discover-journeys-v2.js"') && !discoverRuntime.includes('from "./discover-journeys-v2.js"')) fail("cache-safe Discover runtime does not import cache-safe journey data");
if (!discoverRuntime.includes("el.products.dataset.pairingId=journey.id")) fail("discover runtime does not publish the active journey id to the poster root");
if (!journeysSource.includes('resolvedUrl.origin !== "https://api.open-meteo.com"')) fail("journey guard does not enforce the exact Open-Meteo origin");
if (!journeysSource.includes("queuedActions") || !journeysSource.includes("stopImmediatePropagation") || !journeysSource.includes("controller.abort")) fail("journey guard does not protect user actions from late weather responses");
if (!source.includes("root.dataset.pairingId") || !runtime.includes("dataset.pairingId")) fail("poster renderer does not select artwork by journey id");
if (!journeysSource.includes('poster.style.visibility = supportedPairingIds.has(pairingId) ? "visible" : "hidden";')) fail("unsupported journey ids do not hide stale poster artwork");
if (!journeysSource.includes('[data-pairing-poster]')) fail("journey guard does not target pairing poster artwork");
if (!compatibilityGuard.includes("Compatibility placeholder") || compatibilityGuard.includes("window.fetch =")) fail("standalone guard must remain a no-op compatibility placeholder");

for (const asset of ["discover-v2.js", "discover-journeys-v2.js", "discover-rotation-v2.js"]) {
  if (!serviceWorker.includes(`"./${asset}"`)) fail(`offline cache does not include required Discover asset ${asset}`);
}

if (source.includes("pairing-number") || runtime.includes("pairing-number")) fail("poster renderer must not access the decorative pairing number");
if (!html.includes('src="discover-v2.js"') || !html.includes('src="discover-rotation-v2.js"')) fail("discover.html must load exact cache-safe Discover script paths without query strings");
if (/src="discover(?:-rotation)?\.js(?:\?[^\"]*)?"/.test(html)) fail("discover.html still loads a legacy Discover script path");

for (const token of ["cloneProductCards", "pairing-composition", "pairing-artwork--warm", "pairing-artwork--fresh"]) {
  if (source.includes(token) || runtime.includes(token) || css.includes(token)) fail(`legacy split-screen token remains: ${token}`);
}
if (!css.includes("object-fit: contain")) fail("posters must render without cropping");
if (/\bfilter\s*:/.test(css)) fail("poster CSS must not recolor final artwork");
if (!html.includes("<noscript>") || !html.includes('class="pairing-noscript"')) fail("discover.html must provide a visible no-script fallback");
if (!/<noscript>[\s\S]*href="menu\.html"[\s\S]*<\/noscript>/.test(html)) fail("the no-script fallback must link to the full menu");

console.log(`✅ TASTE-POSTER-001 verified ${EXPECTED_FILES.length} unique square WebP posters, exactly ${ACTIVE_IDS.length} active approved pairings, all offline v2 assets, exact cache-safe script paths, exact weather allowlisting, protected user actions, source/runtime journey-id artwork parity, unsupported-ID poster hiding, and the full-poster renderer.`);
