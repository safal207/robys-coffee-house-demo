import { readVerifiedMenuSource } from "./menu-runtime-source.mjs";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const MENU_ROOT = path.join("src", "products", "menu-v1");
const SETS_ROOT = path.join("src", "products", "sets-v1");
const SET_IDS = [
  "cool-lime-macaron",
  "filter-lotus",
  "iced-san-sebastian",
  "latte-nutella",
  "relax-lotus"
];

function fail(message) {
  throw new Error(`MENU-IMAGES-001: ${message}`);
}

function imageSlug(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function read24LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function webPDimensions(buffer, filePath) {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
    fail(`${filePath} is not a valid WebP`);
  }
  const declaredLength = buffer.readUInt32LE(4) + 8;
  if (declaredLength !== buffer.length) fail(`${filePath} is truncated`);

  const chunk = buffer.toString("ascii", 12, 16);
  const payload = 20;
  if (chunk === "VP8 ") {
    return {
      width: buffer.readUInt16LE(payload + 6) & 0x3fff,
      height: buffer.readUInt16LE(payload + 8) & 0x3fff
    };
  }
  if (chunk === "VP8L") {
    const [b1, b2, b3, b4] = buffer.subarray(payload + 1, payload + 5);
    return {
      width: 1 + b1 + ((b2 & 0x3f) << 8),
      height: 1 + ((b2 & 0xc0) >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10)
    };
  }
  if (chunk === "VP8X") {
    return {
      width: 1 + read24LE(buffer, payload + 4),
      height: 1 + read24LE(buffer, payload + 7)
    };
  }
  fail(`${filePath} uses unsupported WebP chunk ${JSON.stringify(chunk)}`);
}

function verifyAsset(filePath, digests) {
  const buffer = readFileSync(filePath);
  const { width, height } = webPDimensions(buffer, filePath);
  if (width !== 1024 || height !== 1024) fail(`${filePath} must be 1024x1024, found ${width}x${height}`);
  if (buffer.length < 20_000) fail(`${filePath} is unexpectedly small (${buffer.length} bytes)`);
  const digest = createHash("sha256").update(buffer).digest("hex");
  if (digests.has(digest)) fail(`${filePath} duplicates ${digests.get(digest)}`);
  digests.set(digest, filePath);
}

const menuSource = readFileSync("menu-catalog.js", "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(menuSource).toString("base64")}`;
const { menuCategories } = await import(moduleUrl);
const menuRuntime = readVerifiedMenuSource();
const menuStyles = readFileSync("menu-premium.css", "utf8");
const serviceWorker = readFileSync("sw.js", "utf8");
const productCategories = menuCategories.filter((category) => category.id !== "pairing-offers");
const expectedMenuFiles = productCategories.flatMap((category) => {
  const items = category.items ?? category.groups.flatMap((group) => group.items);
  return items.map((item) => `${category.id}--${imageSlug(item.name.en)}.webp`);
}).sort();

if (expectedMenuFiles.length !== 61) fail(`expected 61 individual menu images, found ${expectedMenuFiles.length} menu entries`);
if (new Set(expectedMenuFiles).size !== expectedMenuFiles.length) fail("derived menu image filenames are not unique");

const actualMenuFiles = readdirSync(MENU_ROOT, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".webp"))
  .map((entry) => entry.name)
  .sort();
if (JSON.stringify(actualMenuFiles) !== JSON.stringify(expectedMenuFiles)) {
  fail("menu-v1 files do not exactly match the 61 verified menu entries");
}

const actualSetFiles = readdirSync(SETS_ROOT)
  .filter((name) => name.endsWith(".webp"))
  .sort();
const expectedSetFiles = SET_IDS.map((id) => `${id}.webp`).sort();
if (JSON.stringify(actualSetFiles) !== JSON.stringify(expectedSetFiles)) {
  fail("sets-v1 must contain exactly the five verified pairing photos");
}

for (const fragment of [
  "function productImage(categoryId, item)",
  "src/products/menu-v1/${categoryId}--${imageSlug(item.name.en)}.webp",
  'document.createElement(pairing ? "article" : "div")',
  '"full-menu-item full-menu-item--product"',
  "createGroup({ ...group, items }, category.id)",
  "image.loading = priority ? \"eager\" : \"lazy\"",
  'image.alt = pairing ? localized(item.imageAlt ?? item.name) : ""'
]) {
  if (!menuRuntime.includes(fragment)) fail(`menu-app.js does not wire product photos: ${fragment}`);
}
for (const fragment of [
  ".full-menu-item--product{display:grid;grid-template-columns:104px",
  ".full-menu-item--product .full-menu-item-media img{display:block;width:100%;height:100%;object-fit:cover",
  "@media(max-width:680px){.full-menu-item--product{grid-template-columns:88px"
]) {
  if (!menuStyles.includes(fragment)) fail(`menu-premium.css is missing responsive product-photo styling: ${fragment}`);
}

const pairings = menuCategories.find((category) => category.id === "pairing-offers")?.items ?? [];
for (const id of ["cool-lime-macaron", "iced-san-sebastian"]) {
  const item = pairings.find((entry) => entry.journeyId === id);
  if (item?.image !== `src/products/sets-v1/${id}.webp`) {
    fail(`active pairing ${id} does not use its clean set photo`);
  }
  if (!serviceWorker.includes(`"./src/products/sets-v1/${id}.webp"`)) {
    fail(`service worker does not precache active pairing ${id}`);
  }
}

for (const fileName of expectedMenuFiles) {
  if (!serviceWorker.includes(`"./src/products/menu-v1/${fileName}"`)) {
    fail(`service worker does not precache individual menu photo ${fileName}`);
  }
}
if (serviceWorker.includes("./src/products/cards/pairing-")) {
  fail("service worker retains obsolete pairing-card precache paths");
}
const cacheVersion = serviceWorker.match(/const CACHE_VERSION = "robys-offline-v(\d+)-(\d{8})-[a-z0-9-]+";/)?.slice(1).map(Number);
if (!cacheVersion || cacheVersion[0] < 40 || cacheVersion[1] < 20260903) {
  fail("service-worker cache was not advanced for the complete menu photography rollout");
}

const digests = new Map();
for (const fileName of expectedMenuFiles) verifyAsset(path.join(MENU_ROOT, fileName), digests);
for (const fileName of expectedSetFiles) verifyAsset(path.join(SETS_ROOT, fileName), digests);

console.log(`✅ MENU-IMAGES-001 passed: ${expectedMenuFiles.length} individual product photos and ${expectedSetFiles.length} pairing photos are complete, unique 1024px WebP assets.`);
