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
  /prefers-reduced-motion:\s*reduce[\s\S]*?position:\s*relative/m,
  "Reduced motion must fall back to normal sequential cards"
);

const discoverHtml = readFileSync(resolve(root, "discover.html"), "utf8");
assert.match(
  discoverHtml,
  /discover-deck\.css\?v=20260909-deck-v1/,
  "Discover page must load the deck stylesheet from same origin"
);
assert.match(
  discoverHtml,
  /discover-deck\.js\?v=20260909-deck-v1/,
  "Discover page must load the deck module as progressive enhancement"
);

console.log("discover journey deck contract: PASS");
