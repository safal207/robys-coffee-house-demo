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
const DESCRIPTIVE_ALTS = [
  "Cool Lime ve Makaron eşleşmesi posteri",
  "Cool Lime and Macaron pairing poster",
  "Постер сочетания Cool Lime и макарона"
];
const ACCESSIBLE_PRICES = ["Fiyat: 290 ₺", "Price: 290 ₺", "Цена: 290 ₺"];
const LEGACY_PRICE_ALTS = [
  "Cool Lime ve Makaron eşleşmesi posteri, fiyat 290 Türk lirası",
  "Cool Lime and Macaron pairing poster, price 290 Turkish lira",
  "Постер сочетания Cool Lime и макарона, цена 290 турецких лир"
];
const BASE64_FILES = EXPECTED_IDS.map((id) => `${id}.webp.b64.txt`);
const DIRECT_FILES = ["cool-lime-macaron-hq.webp"];
const EXPECTED_FILES = [...BASE64_FILES, ...DIRECT_FILES].sort();
const fail = (message) => { throw new Error(`TASTE-POSTER-001: ${message}`); };
const read24LE = (buffer, offset) => buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
const revisionFor = (buffer) => createHash("sha256").update(buffer).digest("hex").slice(0, 12);

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

const seen = new Map();
function verifyWebP(image, filePath, minimumSize = 280) {
  if (image.length < 30 || image.toString("ascii", 0, 4) !== "RIFF" || image.toString("ascii", 8, 12) !== "WEBP") fail(`${filePath} does not decode to WebP`);
  const declaredLength = image.readUInt32LE(4) + 8;
  if (declaredLength !== image.length) fail(`${filePath} is truncated: RIFF declares ${declaredLength} bytes, decoded ${image.length}`);
  const { width, height } = dimensions(image);
  if (width !== height || width < minimumSize) fail(`${filePath} must be a square poster of at least ${minimumSize}px, found ${width}x${height}`);
  const digest = createHash("sha256").update(image).digest("hex");
  if (seen.has(digest)) fail(`${filePath} duplicates ${seen.get(digest)}`);
  seen.set(digest, filePath);
  return { width, height };
}

const rootEntries = readdirSync(ROOT).sort();
if (rootEntries.length !== 1 || rootEntries[0] !== "final") fail(`pairing assets must live only in ${FINAL}; found ${rootEntries.join(", ")}`);
const actualFiles = readdirSync(FINAL).sort();
if (JSON.stringify(actualFiles) !== JSON.stringify(EXPECTED_FILES)) fail(`expected ${EXPECTED_FILES.join(", ")}; found ${actualFiles.join(", ")}`);

for (const fileName of BASE64_FILES) {
  const filePath = path.join(FINAL, fileName);
  const base64 = readFileSync(filePath, "utf8").trim();
  if (!base64 || /\s/.test(base64) || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) fail(`${filePath} is not a single valid base64 payload`);
  verifyWebP(Buffer.from(base64, "base64"), filePath);
}

for (const fileName of DIRECT_FILES) {
  const filePath = path.join(FINAL, fileName);
  const { width, height } = verifyWebP(readFileSync(filePath), filePath, 1024);
  if (width !== 1024 || height !== 1024) fail(`${filePath} must be exactly 1024x1024 for Retina delivery, found ${width}x${height}`);
}

const source = readFileSync(path.join("src", "discover-rotation.ts"), "utf8");
const runtimeBuffer = readFileSync("discover-rotation-v3.js");
const runtime = runtimeBuffer.toString("utf8");
const discoverRuntime = readFileSync("discover-v2.js", "utf8");
const journeysSource = readFileSync("discover-journeys-v2.js", "utf8");
const compatibilityGuard = readFileSync("discover-weather-guard.js", "utf8");
const serviceWorker = readFileSync("sw.js", "utf8");
const buildScript = readFileSync(path.join("scripts", "build.mjs"), "utf8");
const cssBuffer = readFileSync("discover-rotation.css");
const css = cssBuffer.toString("utf8");
const html = readFileSync("discover.html", "utf8");

for (const [label, text] of [["source", source], ["runtime v3", runtime]]) {
  for (const id of EXPECTED_IDS) {
    const expectedSource = id === "cool-lime-macaron"
      ? 'source: "src/pairings-data/final/cool-lime-macaron-hq.webp"'
      : `posterSource("${id}")`;
    if (!text.includes(expectedSource)) fail(`${label} renderer does not map ${id} to ${expectedSource}`);
    if (!text.includes(`"${id}": {`)) fail(`${label} renderer is not keyed by journey id ${id}`);
  }
  for (const altText of DESCRIPTIVE_ALTS) {
    if (!text.includes(`"${altText}"`)) fail(`${label} renderer does not keep the Cool Lime poster alt text descriptive`);
  }
  for (const priceText of ACCESSIBLE_PRICES) {
    if (!text.includes(`"${priceText}"`)) fail(`${label} renderer does not expose the 290 TRY price as localized DOM text`);
  }
  for (const legacyAlt of LEGACY_PRICE_ALTS) {
    if (text.includes(`"${legacyAlt}"`)) fail(`${label} renderer still embeds commercial price data in alt text`);
  }
  if (!text.includes('source.endsWith(".webp")')) fail(`${label} renderer does not support direct WebP poster sources`);
  if (!text.includes('caption.className = "pairing-poster-price"')) fail(`${label} renderer does not create the semantic localized price caption`);
  if (!text.includes('image.setAttribute("aria-describedby", caption.id)')) fail(`${label} renderer does not associate the poster image with its price caption`);
  if (!text.includes("caption.textContent = poster.price[currentLanguage()]")) fail(`${label} renderer does not localize or refresh the price caption`);
}

if (!source.includes("price?: PosterLocalizedText;")) fail("typed poster model does not expose optional localized commercial data");
if (!source.includes("if (image.complete)") || !source.includes("Promise.reject(new Error(\"Poster image failed to decode\"))")) fail("typed renderer does not reject an already-completed failed image decode");
if (!runtime.includes("if (image.complete)") || !runtime.includes('Promise.reject(new Error("Poster image failed to decode"))')) fail("generated v3 renderer does not reject an already-completed failed image decode");

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

for (const asset of ["discover-v2.js", "discover-journeys-v2.js", "src/pairings-data/final/cool-lime-macaron-hq.webp"]) {
  if (!serviceWorker.includes(`"./${asset}"`)) fail(`offline cache does not include required Discover asset ${asset}`);
}

const scriptRevision = revisionFor(runtimeBuffer);
const cssRevision = revisionFor(cssBuffer);
const scriptRevisionMatch = html.match(/src="discover-rotation-v3\.js\?v=([a-f0-9]{12})"/);
const cssRevisionMatch = html.match(/href="discover-rotation\.css\?v=([a-f0-9]{12})"/);
if (!scriptRevisionMatch) fail("discover.html must load the v3 poster renderer with a 12-character SHA revision");
if (!cssRevisionMatch) fail("discover.html must load the poster stylesheet with a 12-character SHA revision");
if (scriptRevisionMatch[1] !== scriptRevision) fail(`discover.html v3 renderer revision is stale: expected ${scriptRevision}, found ${scriptRevisionMatch[1]}`);
if (cssRevisionMatch[1] !== cssRevision) fail(`discover.html poster CSS revision is stale: expected ${cssRevision}, found ${cssRevisionMatch[1]}`);
if (!serviceWorker.includes(`"./discover-rotation-v3.js?v=${scriptRevision}"`)) fail("service worker does not precache the exact v3 renderer revision used by discover.html");
if (!serviceWorker.includes(`"./discover-rotation.css?v=${cssRevision}"`)) fail("service worker does not precache the exact poster CSS revision used by discover.html");
if (!serviceWorker.includes(`robys-offline-v9-20260630-discover-${scriptRevision}-${cssRevision}`)) fail("service-worker cache version does not include the active JS and CSS revisions");
if (!serviceWorker.includes('url.pathname.endsWith("/discover-rotation-v3.js")') || !serviceWorker.includes('url.pathname.endsWith("/discover-rotation.css")') || !serviceWorker.includes("return cache.match(request);")) fail("service worker does not use exact query matching for both revisioned JS and CSS");
if (!buildScript.includes('transpileClassicScript("src/discover-rotation.ts", "discover-rotation-v3.js")')) fail("build does not generate the v3 poster renderer from the typed source");
if (!buildScript.includes('synchronizeScript(discoverHtml, "discover-rotation-v3.js", discoverRotationRevision)')) fail("build does not refresh the v3 renderer revision in discover.html");
if (!buildScript.includes('synchronizeStylesheet(discoverHtml, "discover-rotation.css", discoverRotationCssRevision)')) fail("build does not refresh the poster CSS revision in discover.html");
if (!buildScript.includes("synchronizeServiceWorker(") || !buildScript.includes("discoverRotationCssRevision")) fail("build does not synchronize both JS and CSS revisions into the service worker");

if (source.includes("pairing-number") || runtime.includes("pairing-number")) fail("poster renderer must not access the decorative pairing number");
if (!html.includes('src="discover-v2.js"')) fail("discover.html must load the v2 journey runtime");
if (html.includes('src="discover-rotation-v2.js"')) fail("discover.html must not load the stale v2 poster renderer cache key");
if (/src="discover(?:-rotation)?\.js(?:\?[^\"]*)?"/.test(html)) fail("discover.html still loads a legacy Discover script path");

for (const token of ["cloneProductCards", "pairing-composition", "pairing-artwork--warm", "pairing-artwork--fresh"]) {
  if (source.includes(token) || runtime.includes(token) || css.includes(token)) fail(`legacy split-screen token remains: ${token}`);
}
if (!css.includes("object-fit: contain")) fail("posters must render without cropping");
if (!css.includes(".pairing-poster-price") || !css.includes("clip-path: inset(50%)")) fail("localized commercial price text must remain in the accessibility tree without changing the approved visual");
if (/\bfilter\s*:/.test(css)) fail("poster CSS must not recolor final artwork");
if (!html.includes("<noscript>") || !html.includes('class="pairing-noscript"')) fail("discover.html must provide a visible no-script fallback");
if (!/<noscript>[\s\S]*href="menu\.html"[\s\S]*<\/noscript>/.test(html)) fail("the no-script fallback must link to the full menu");

console.log(`✅ TASTE-POSTER-001 verified ${BASE64_FILES.length} base64 posters plus ${DIRECT_FILES.length} direct 1024px Retina poster, descriptive localized alt text, semantic localized DOM pricing, exactly ${ACTIVE_IDS.length} active approved pairings, synchronized JS ${scriptRevision} and CSS ${cssRevision} cache keys, exact offline precache parity, failed-decode recovery, exact weather allowlisting, protected user actions, source/runtime journey-id artwork parity, unsupported-ID poster hiding, and the full-poster renderer.`);
