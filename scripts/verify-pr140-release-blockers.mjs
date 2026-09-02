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
const { menuCategories, pairingOfferCatalog, isPublicPairingEligible } = await import(moduleUrl);

const allItems = menuCategories.flatMap((category) =>
  category.items ?? category.groups.flatMap((group) => group.items)
);
const pairingCategory = menuCategories.find((category) => category.id === "pairing-offers");
const pairingOffer = pairingOfferCatalog.find(
  (item) => item.id === "cool-lime-macaron-pairing"
);
const coolLime = allItems.find((item) => item.name?.tr === "Cool Lime" && item.price === 190);
const macaron = allItems.find((item) => item.name?.tr === "Makaron" && item.price === 30);

assert(pairingCategory, "menu-data.js does not define the pairing-offers category");
assert(pairingOffer, "menu-data.js does not retain the Cool Lime + Macaron source evidence");
assert(pairingOffer.price === 290, `source evidence must retain 290 TRY, found ${pairingOffer.price}`);
assert(pairingOffer.sourceStatus === "provisional", "Cool Lime + Macaron must remain provisional");
assert(pairingOffer.availability === "unavailable", "Cool Lime + Macaron must remain unavailable");
assert(
  pairingOffer.availabilityReason === "offer-price-exceeds-components-without-declared-extra-value",
  "Cool Lime + Macaron must retain its commercial blocker"
);
assert(!isPublicPairingEligible(pairingOffer.journeyId), "Cool Lime + Macaron must fail the public eligibility gate");
assert(
  !pairingCategory.items?.some((item) => item.id === pairingOffer.id),
  "Cool Lime + Macaron must not appear in the public menu"
);
assert(coolLime, "individual Cool Lime price must remain explicitly verified at 190 TRY");
assert(macaron, "individual Macaron price must remain explicitly verified at 30 TRY");
for (const language of ["tr", "en", "ru"]) {
  assert(pairingOffer.name?.[language]?.trim(), `pairing offer name is missing ${language}`);
  assert(pairingOffer.description?.[language]?.trim(), `pairing offer description is missing ${language}`);
}

const html = readFileSync("discover.html", "utf8");
const serviceWorker = readFileSync("sw.js", "utf8");
const buildScript = readFileSync("scripts/build.mjs", "utf8");
const discoverRuntimeRevision = revisionFor("discover-runtime.js");
const discoverRuntime = readFileSync("discover-runtime.js", "utf8");
const scriptRevision = revisionFor("discover-rotation-v3.js");
const cssRevision = revisionFor("discover-rotation.css");

assert(
  html.includes(`src="discover-runtime.js?v=${discoverRuntimeRevision}"`),
  `discover.html runtime revision does not match discover-runtime.js (${discoverRuntimeRevision})`
);
assert(!html.includes('src="discover-v2.js'), "Discover HTML still loads the stale-cache-prone source module path");
assert(
  !/\b(?:import|from)\b[^;]*\.\/(?:menu-data|discover-copy|discover-journeys-v2)\.js/.test(discoverRuntime),
  "deployed Discover runtime still has generation-mixable module imports"
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
  serviceWorker.includes(`"./discover-runtime.js?v=${discoverRuntimeRevision}"`),
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
const cacheRevisionSegment = `-${discoverRuntimeRevision}-${scriptRevision}-${cssRevision}`;
const cacheVersion = serviceWorker.match(/const CACHE_VERSION = "([^"]+)";/)?.[1];
assert(
  cacheVersion?.includes(cacheRevisionSegment),
  "service-worker cache version does not include the Discover runtime, poster JS and CSS revisions"
);
assert(
  serviceWorker.includes('url.pathname.endsWith("/discover-runtime.js")') &&
    serviceWorker.includes('url.pathname.endsWith("/discover-rotation-v3.js")') &&
    serviceWorker.includes('url.pathname.endsWith("/discover-rotation.css")') &&
    serviceWorker.includes("return cache.match(request);"),
  "service worker does not exact-match all revisioned Discover runtime and poster requests"
);
assert(
  buildScript.includes("function synchronizeModuleScript") &&
    buildScript.includes('entryPoints: ["discover-runtime-entry.js"]') &&
    buildScript.includes('revisionFor("discover-runtime.js")') &&
    buildScript.includes('synchronizeModuleScript(discoverHtml, "discover-runtime.js"') &&
    buildScript.includes("discoverRuntimeRevision"),
  "build script does not own and synchronize the Discover interaction runtime revision"
);
for (const legacyAsset of ["menu-data.js", "discover-copy.js", "discover-journeys-v2.js"]) {
  assert(!serviceWorker.includes(`"./${legacyAsset}"`), `offline shell still precaches generation-mixable ${legacyAsset}`);
}
assert(
  buildScript.includes("function synchronizeStylesheet") &&
    buildScript.includes('revisionFor("discover-rotation.css")') &&
    buildScript.includes('synchronizeStylesheet(discoverHtml, "discover-rotation.css"') &&
    buildScript.includes("discoverRotationCssRevision"),
  "build script does not own and synchronize the poster CSS revision"
);

console.log(
  `✅ PR140-BLOCKERS-001 passed: the 290 TRY source evidence remains quarantined from the public 190 + 30 TRY items; HTML, build and service worker agree on Discover runtime ${discoverRuntimeRevision}, poster JS ${scriptRevision} and CSS ${cssRevision}.`
);
