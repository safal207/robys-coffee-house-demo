import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { menuCategories } from "../menu-catalog.js";
import { journeys } from "../discover-journeys-v2.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const expectedJourneys = ["cool-lime-macaron", "iced-san-sebastian"];

assert.deepEqual(
  [...journeys.map((journey) => journey.id)].sort(),
  [...expectedJourneys].sort(),
  "P0 deck must stay bounded to the two active Taste Journey entries"
);

const pairingCategory = menuCategories.find((category) => category.id === "pairing-offers");
assert.ok(pairingCategory, "Pairing category must exist in the real menu catalog");
const pairingByJourney = new Map(
  (pairingCategory.items ?? []).map((item) => [item.journeyId, item])
);

for (const journeyId of expectedJourneys) {
  const pairing = pairingByJourney.get(journeyId);
  assert.ok(pairing, `${journeyId}: deck journey must resolve to a real catalog pairing`);
  assert.ok(pairing.image, `${journeyId}: catalog pairing image is required`);
  assert.ok(existsSync(resolve(root, pairing.image)), `${journeyId}: catalog pairing image must exist`);
}

const sanCategory = menuCategories.find((category) => category.id === "desserts");
const sanSebastian = sanCategory?.items?.find((item) => item.name?.en === "San Sebastian Cheesecake");
assert.ok(sanSebastian, "San Sebastian destination must remain a real dessert in the catalog");

const deckSource = readFileSync(resolve(root, "discover-deck.js"), "utf8");
assert.match(deckSource, /"iced-san-sebastian"/);
assert.match(deckSource, /desserts:san-sebastian-cheesecake/);
assert.match(deckSource, /"cool-lime-macaron"/);
assert.match(deckSource, /pairing-offers:cool-lime-macaron-pairing/);
assert.doesNotMatch(
  deckSource,
  /\b(?:290|370)\b/,
  "Deck must not duplicate catalog prices in its presentation layer"
);
assert.match(
  deckSource,
  /menu-catalog\.js\?v=20260904-premium-order-v1/,
  "Deck must read its pairing media from the same catalog version as the menu"
);
assert.match(
  deckSource,
  /#pairing-products/,
  "Deck order must preserve the existing Taste Journey current recommendation"
);

const deckCss = readFileSync(resolve(root, "discover-deck.css"), "utf8");
assert.match(deckCss, /\.journey-deck-card\s*\{[\s\S]*?position:\s*sticky;/m);
assert.match(deckCss, /\.journey-deck-card:nth-child\(2\)/);
assert.match(
  deckCss,
  /@media\s*\(max-width:\s*900px\)\s*and\s*\(max-height:\s*700px\)[\s\S]*?position:\s*relative;[\s\S]*?top:\s*auto;[\s\S]*?min-height:\s*0;/m,
  "Short viewports must disable sticky stacking so every CTA remains reachable"
);
assert.match(
  deckCss,
  /prefers-reduced-motion:\s*reduce[\s\S]*?position:\s*relative/m,
  "Reduced motion must fall back to normal sequential cards"
);

const discoverHtml = readFileSync(resolve(root, "discover.html"), "utf8");
assert.match(
  discoverHtml,
  /discover-deck\.css\?v=[a-f0-9]{12}/,
  "Discover page must load a build-revisioned deck stylesheet"
);
assert.match(
  discoverHtml,
  /discover-deck\.js\?v=[a-f0-9]{12}/,
  "Discover page must load a build-revisioned deck module"
);

const swSource = readFileSync(resolve(root, "sw.js"), "utf8");
for (const file of [
  "discover-deck.css",
  "discover-deck.js",
  "menu-product-reveal.css",
  "menu-product-reveal.js",
  "menu-product-reveal-runtime.js"
]) {
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(
    swSource,
    new RegExp(`"\\./${escaped}\\?v=[a-f0-9]{12}"`),
    `${file}: service worker must precache the exact build revision`
  );
}
assert.match(
  swSource,
  /"\.\/src\/products\/san-sebastian\.webp"/,
  "Offline San Sebastian reveal must include its alternate image"
);

const buildSource = readFileSync(resolve(root, "scripts/build.mjs"), "utf8");
for (const file of [
  "discover-deck.css",
  "discover-deck.js",
  "menu-product-reveal.css",
  "menu-product-reveal.js",
  "menu-product-reveal-runtime.js"
]) {
  assert.ok(
    buildSource.includes(`revisionFor("${file}")`),
    `${file}: build must own the cache revision`
  );
}
assert.match(
  buildSource,
  /synchronizeModuleImport\(menuProductRevealSource, "menu-product-reveal-runtime\.js"/,
  "Build must synchronize the lazy reveal runtime import"
);

console.log("discover journey deck + offline closure + short-height fallback contract: PASS");
