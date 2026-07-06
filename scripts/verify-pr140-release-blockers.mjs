import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const fail = (message) => {
  throw new Error(`PR140-BLOCKERS-001: ${message}`);
};

const assert = (condition, message) => {
  if (!condition) fail(message);
};

const revisionFor = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 12);

const menuSource = readFileSync("menu-data.js", "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(menuSource).toString("base64")}`;
const { menuCategories } = await import(moduleUrl);

const allItems = menuCategories.flatMap((category) =>
  category.items ?? category.groups.flatMap((group) => group.items)
);
const pairingCategory = menuCategories.find((category) => category.id === "pairing-offers");
const pairingOffer = pairingCategory?.items?.find(
  (item) => item.id === "cool-lime-macaron-pairing"
);
const coolLime = allItems.find((item) => item.name?.tr === "Cool Lime" && item.price === 190);
const macaron = allItems.find((item) => item.name?.tr === "Makaron" && item.price === 30);

assert(pairingCategory, "menu-data.js does not define the pairing-offers category");
assert(pairingOffer, "menu-data.js does not define the Cool Lime + Macaron pairing offer");
assert(pairingOffer.price === 290, `pairing offer must cost 290 TRY, found ${pairingOffer.price}`);
assert(coolLime, "individual Cool Lime price must remain explicitly verified at 190 TRY");
assert(macaron, "individual Macaron price must remain explicitly verified at 30 TRY");
for (const language of ["tr", "en", "ru"]) {
  assert(pairingOffer.name?.[language]?.trim(), `pairing offer name is missing ${language}`);
  assert(pairingOffer.description?.[language]?.trim(), `pairing offer description is missing ${language}`);
}

const html = readFileSync("discover.html", "utf8");
const serviceWorker = readFileSync("sw.js", "utf8");
const buildScript = readFileSync("scripts/build.mjs", "utf8");
const discoverRuntimeRevision = revisionFor("discover-v2.js");
const scriptRevision = revisionFor("discover-rotation-v3.js");
const cssRevision = revisionFor("discover-rotation.css");

assert(
  html.includes(`src="discover-v2.js?v=${discoverRuntimeRevision}"`),
  `discover.html runtime revision does not match discover-v2.js (${discoverRuntimeRevision})`
);
assert(
  html.includes(`href="discover-rotation.css?v=${cssRevision}"`),
  `discover.html CSS revision does not match discover-rotation.css (${cssRevision})`
);
assert(
  html.includes(`src="discover-rotation-v3.js?v=${scriptRevision}"`),
  `discover.html JS revision does not match discover-rotation-v3.js (${scriptRevision})`
);
assert(
  serviceWorker.includes(`"./discover-v2.js?v=${discoverRuntimeRevision}"`),
  "service worker does not precache the exact Discover runtime revision loaded by discover.html"
);
assert(
  serviceWorker.includes(`"./discover-rotation.css?v=${cssRevision}"`),
  "service worker does not precache the exact CSS revision loaded by discover.html"
);
assert(
  serviceWorker.includes(`"./discover-rotation-v3.js?v=${scriptRevision}"`),
  "service worker does not precache the exact poster JS revision loaded by discover.html"
);
const cacheRevisionSuffix = `-${discoverRuntimeRevision}-${scriptRevision}-${cssRevision}`;
const cacheVersion = serviceWorker.match(/const CACHE_VERSION = "([^"]+)";/)?.[1];
assert(
  cacheVersion?.endsWith(cacheRevisionSuffix),
  "service-worker cache version does not include the Discover runtime, poster JS and CSS revisions"
);
assert(
  serviceWorker.includes('url.pathname.endsWith("/discover-v2.js")') &&
    serviceWorker.includes('url.pathname.endsWith("/discover-rotation-v3.js")') &&
    serviceWorker.includes('url.pathname.endsWith("/discover-rotation.css")') &&
    serviceWorker.includes("return cache.match(request);"),
  "service worker does not exact-match all revisioned Discover runtime and poster requests"
);
assert(
  buildScript.includes("function synchronizeModuleScript") &&
    buildScript.includes('revisionFor("discover-v2.js")') &&
    buildScript.includes('synchronizeModuleScript(discoverHtml, "discover-v2.js"') &&
    buildScript.includes("discoverRuntimeRevision"),
  "build script does not own and synchronize the Discover interaction runtime revision"
);
assert(
  buildScript.includes("function synchronizeStylesheet") &&
    buildScript.includes('revisionFor("discover-rotation.css")') &&
    buildScript.includes('synchronizeStylesheet(discoverHtml, "discover-rotation.css"') &&
    buildScript.includes("discoverRotationCssRevision"),
  "build script does not own and synchronize the poster CSS revision"
);

console.log(
  `✅ PR140-BLOCKERS-001 passed: menu defines the 290 TRY pairing offer separately from 190 + 30 TRY individual items; HTML, build and service worker agree on Discover runtime ${discoverRuntimeRevision}, poster JS ${scriptRevision} and CSS ${cssRevision}.`
);
