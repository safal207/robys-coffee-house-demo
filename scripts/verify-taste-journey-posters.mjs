import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.join("src", "pairings-data");
const FINAL = path.join(ROOT, "final");
const APPROVED = path.join(ROOT, "approved");
const APPROVED_ICED_POSTER = path.join(APPROVED, "iced-san-sebastian-hq.png");
const APPROVED_ICED_MANIFEST_PATH = "src/pairings-data/approved/iced-san-sebastian-hq.png";
const APPROVED_ICED_WIDTH = 1254;
const APPROVED_ICED_HEIGHT = 1254;
const EXPECTED_IDS = [
  "latte-nutella",
  "iced-san-sebastian",
  "filter-lotus",
  "relax-lotus",
  "cool-lime-macaron"
];
const ACTIVE_IDS = ["cool-lime-macaron", "iced-san-sebastian"];
const BASE64_FILES = EXPECTED_IDS.map((id) => `${id}.webp.b64.txt`);
const FINAL_DIRECT_FILES = ["cool-lime-macaron-hq.webp"];
const EXPECTED_FINAL_FILES = [...BASE64_FILES, ...FINAL_DIRECT_FILES].sort();
const DESCRIPTIVE_ALTS = [
  "Cool Lime ve Makaron eşleşmesi posteri",
  "Cool Lime and Macaron pairing poster",
  "Постер сочетания Cool Lime и макарона"
];
const ACCESSIBLE_PRICES = ["Fiyat: 290 ₺", "Price: 290 ₺", "Цена: 290 ₺"];
const fail = (message) => { throw new Error(`TASTE-POSTER-001: ${message}`); };
const revisionFor = (buffer) => createHash("sha256").update(buffer).digest("hex").slice(0, 12);
const digestFor = (buffer) => createHash("sha256").update(buffer).digest("hex");
const read24LE = (buffer, offset) => buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);

const integrityManifest = JSON.parse(readFileSync("integrity-manifest.json", "utf8"));
const approvedManifestEntry = integrityManifest.files?.find(
  (file) => file.path === APPROVED_ICED_MANIFEST_PATH
);
if (!approvedManifestEntry) {
  fail(`integrity-manifest.json does not protect ${APPROVED_ICED_MANIFEST_PATH}`);
}

function webPDimensions(buffer) {
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

function verifyWebP(buffer, filePath, minimumSize = 280) {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") fail(`${filePath} is not WebP`);
  const declaredLength = buffer.readUInt32LE(4) + 8;
  if (declaredLength !== buffer.length) fail(`${filePath} is truncated: RIFF declares ${declaredLength}, found ${buffer.length}`);
  const { width, height } = webPDimensions(buffer);
  if (width !== height || width < minimumSize) fail(`${filePath} must be square and at least ${minimumSize}px, found ${width}x${height}`);
  return { width, height };
}

function verifyApprovedPng(buffer, filePath) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(signature)) fail(`${filePath} is not PNG`);

  const ihdrLength = buffer.readUInt32BE(8);
  const ihdrType = buffer.subarray(12, 16).toString("ascii");
  if (ihdrLength !== 13 || ihdrType !== "IHDR") {
    fail(`${filePath} does not contain a valid PNG IHDR chunk`);
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width !== APPROVED_ICED_WIDTH || height !== APPROVED_ICED_HEIGHT) {
    fail(`${filePath} must be exactly ${APPROVED_ICED_WIDTH}x${APPROVED_ICED_HEIGHT}, found ${width}x${height}`);
  }

  const digest = digestFor(buffer);
  if (buffer.length !== approvedManifestEntry.bytes) {
    fail(`${filePath} byte length differs from integrity manifest: expected ${approvedManifestEntry.bytes}, found ${buffer.length}`);
  }
  if (digest !== approvedManifestEntry.sha256) {
    fail(`${filePath} SHA-256 differs from integrity manifest: expected ${approvedManifestEntry.sha256}, found ${digest}`);
  }

  return { width, height, bytes: buffer.length, digest };
}

const rootEntries = readdirSync(ROOT).sort();
if (JSON.stringify(rootEntries) !== JSON.stringify(["approved", "final"])) fail(`expected approved and final asset folders; found ${rootEntries.join(", ")}`);
const finalFiles = readdirSync(FINAL).sort();
if (JSON.stringify(finalFiles) !== JSON.stringify(EXPECTED_FINAL_FILES)) fail(`expected final assets ${EXPECTED_FINAL_FILES.join(", ")}; found ${finalFiles.join(", ")}`);
const approvedFiles = readdirSync(APPROVED).sort();
if (JSON.stringify(approvedFiles) !== JSON.stringify(["iced-san-sebastian-hq.png"])) fail(`expected only the approved Iced Latte poster; found ${approvedFiles.join(", ")}`);

for (const fileName of BASE64_FILES) {
  const filePath = path.join(FINAL, fileName);
  const base64 = readFileSync(filePath, "utf8").trim();
  if (!base64 || /\s/.test(base64) || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) fail(`${filePath} is not a single valid base64 payload`);
  verifyWebP(Buffer.from(base64, "base64"), filePath);
}

for (const fileName of FINAL_DIRECT_FILES) {
  const filePath = path.join(FINAL, fileName);
  const { width, height } = verifyWebP(readFileSync(filePath), filePath, 1024);
  if (width !== 1024 || height !== 1024) fail(`${filePath} must be exactly 1024x1024, found ${width}x${height}`);
}

const approvedImage = verifyApprovedPng(readFileSync(APPROVED_ICED_POSTER), APPROVED_ICED_POSTER);

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

const expectedSources = {
  "latte-nutella": 'posterSource("latte-nutella")',
  "iced-san-sebastian": 'source: "src/pairings-data/approved/iced-san-sebastian-hq.png"',
  "filter-lotus": 'posterSource("filter-lotus")',
  "relax-lotus": 'posterSource("relax-lotus")',
  "cool-lime-macaron": 'source: "src/pairings-data/final/cool-lime-macaron-hq.webp"'
};

for (const [label, text] of [["source", source], ["runtime v3", runtime]]) {
  for (const id of EXPECTED_IDS) {
    if (!text.includes(expectedSources[id])) fail(`${label} renderer does not map ${id} to ${expectedSources[id]}`);
    if (!text.includes(`"${id}": {`)) fail(`${label} renderer is not keyed by journey id ${id}`);
  }
  if (!text.includes('/\\.(?:png|webp)$/i.test(source)')) fail(`${label} renderer does not support direct PNG and WebP poster sources`);
  for (const altText of DESCRIPTIVE_ALTS) if (!text.includes(`"${altText}"`)) fail(`${label} renderer lost descriptive localized alt text`);
  for (const priceText of ACCESSIBLE_PRICES) if (!text.includes(`"${priceText}"`)) fail(`${label} renderer lost localized semantic pricing`);
  if (!text.includes('caption.className = "pairing-poster-price"')) fail(`${label} renderer does not create the semantic price caption`);
  if (!text.includes('image.setAttribute("aria-describedby", caption.id)')) fail(`${label} renderer does not associate image and price`);
  if (!text.includes("caption.textContent = poster.price[currentLanguage()]")) fail(`${label} renderer does not refresh localized pricing`);
}

if (!source.includes("price?: PosterLocalizedText;")) fail("typed poster model lost optional localized commercial data");
if (!source.includes("if (image.complete)") || !runtime.includes("if (image.complete)")) fail("poster renderer lost completed-image decode handling");

const journeysBlock = journeysSource.match(/export const journeys\s*=\s*\[([\s\S]*?)\n\];\s*\n\s*export const imageAlt/)?.[1];
if (!journeysBlock) fail("could not isolate the exported journeys array");
const actualIds = [...journeysBlock.matchAll(/^\s{4}id:\s*"([^"]+)"/gm)].map((match) => match[1]);
if (JSON.stringify(actualIds) !== JSON.stringify(ACTIVE_IDS)) fail(`discover page must expose only ${ACTIVE_IDS.join(", ")}; found ${actualIds.join(", ")}`);
if (!journeysSource.includes('const ACTIVE_PAIRING_IDS = ["cool-lime-macaron", "iced-san-sebastian"];')) fail("journey guard active IDs changed");
if (!discoverRuntime.includes("el.products.dataset.pairingId=journey.id")) fail("Discover runtime does not publish the active journey id");
if (!journeysSource.includes('resolvedUrl.origin !== "https://api.open-meteo.com"')) fail("weather guard origin allowlist changed");
if (!compatibilityGuard.includes("Compatibility placeholder") || compatibilityGuard.includes("window.fetch =")) fail("standalone weather guard must remain a no-op placeholder");

for (const asset of [
  "discover-v2.js",
  "discover-journeys-v2.js",
  "src/pairings-data/final/cool-lime-macaron-hq.webp",
  "src/pairings-data/approved/iced-san-sebastian-hq.png"
]) {
  if (!serviceWorker.includes(`"./${asset}"`)) fail(`offline cache does not include required Discover asset ${asset}`);
}

const scriptRevision = revisionFor(runtimeBuffer);
const cssRevision = revisionFor(cssBuffer);
const scriptRevisionMatch = html.match(/src="discover-rotation-v3\.js\?v=([a-f0-9]{12})"/);
const cssRevisionMatch = html.match(/href="discover-rotation\.css\?v=([a-f0-9]{12})"/);
if (!scriptRevisionMatch || scriptRevisionMatch[1] !== scriptRevision) fail(`discover.html JS revision must be ${scriptRevision}`);
if (!cssRevisionMatch || cssRevisionMatch[1] !== cssRevision) fail(`discover.html CSS revision must be ${cssRevision}`);
if (!serviceWorker.includes(`"./discover-rotation-v3.js?v=${scriptRevision}"`)) fail("service worker JS revision is stale");
if (!serviceWorker.includes(`"./discover-rotation.css?v=${cssRevision}"`)) fail("service worker CSS revision is stale");
if (!serviceWorker.includes(`robys-offline-v10-20260701-posters-${scriptRevision}-${cssRevision}`)) fail("service-worker cache version does not include current poster revisions");
if (!buildScript.includes('transpileClassicScript("src/discover-rotation.ts", "discover-rotation-v3.js")')) fail("build does not generate the active renderer");
if (!buildScript.includes('synchronizeScript(discoverHtml, "discover-rotation-v3.js", discoverRotationRevision)')) fail("build does not synchronize the renderer revision");
if (!buildScript.includes('synchronizeStylesheet(discoverHtml, "discover-rotation.css", discoverRotationCssRevision)')) fail("build does not synchronize the stylesheet revision");

if (source.includes("pairing-number") || runtime.includes("pairing-number")) fail("poster renderer must not access the decorative pairing number");
if (!css.includes("object-fit: contain")) fail("posters must render without cropping");
if (/\bfilter\s*:/.test(css)) fail("poster CSS must not recolor approved artwork");
if (!html.includes("<noscript>") || !html.includes('class="pairing-noscript"')) fail("Discover page must keep the no-script fallback");

console.log(`✅ TASTE-POSTER-001 verified the approved ${approvedImage.width}x${approvedImage.height} Iced Latte + San Sebastian PNG (${approvedImage.bytes} bytes, SHA-256 ${approvedImage.digest}), source/runtime mapping, offline delivery and synchronized cache revisions.`);
