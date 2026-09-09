import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { menuCategories } from "../menu-catalog.js";
import { journeys } from "../discover-journeys-v2.js";
import { alternativeJourney, pairingForJourney, productRouteForJourney } from "../discover-deck.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const activeIds = journeys.map((journey) => journey.id);

assert.deepEqual(
  activeIds,
  ["cool-lime-macaron", "iced-san-sebastian"],
  "P0 deck must remain bounded to the two active Taste Journey pairings"
);

const pairingCategory = menuCategories.find((category) => category.id === "pairing-offers");
assert.ok(pairingCategory, "Pairing catalog category must exist");

const expected = new Map([
  ["cool-lime-macaron", { price: 290, image: "src/products/sets-v1/cool-lime-macaron.webp" }],
  ["iced-san-sebastian", { price: 370, image: "src/products/sets-v1/iced-san-sebastian.webp" }]
]);

for (const [journeyId, truth] of expected) {
  const catalogItem = pairingCategory.items.find((item) => item.journeyId === journeyId);
  assert.ok(catalogItem, `${journeyId}: pairing must exist in menu-catalog.js`);
  assert.equal(catalogItem.price, truth.price, `${journeyId}: deck price truth must come from catalog`);
  assert.equal(catalogItem.image, truth.image, `${journeyId}: deck image truth must come from catalog`);
  assert.equal(pairingForJourney(journeyId)?.price, truth.price, `${journeyId}: deck helper must resolve catalog item`);
}

assert.equal(alternativeJourney("cool-lime-macaron")?.id, "iced-san-sebastian");
assert.equal(alternativeJourney("iced-san-sebastian")?.id, "cool-lime-macaron");
assert.equal(alternativeJourney(""), null);

assert.deepEqual(
  productRouteForJourney("iced-san-sebastian"),
  { category: "desserts", product: "desserts:san-sebastian-cheesecake" },
  "San Sebastian journey must deep-link to the real dessert product"
);
assert.deepEqual(
  productRouteForJourney("cool-lime-macaron"),
  { category: "pairing-offers", product: "pairing-offers:cool-lime-macaron-pairing" },
  "Cool Lime journey must deep-link to the real pairing product"
);
assert.equal(productRouteForJourney("unknown"), null);

const desserts = menuCategories.find((category) => category.id === "desserts");
assert.ok(
  desserts?.items?.some((item) => item.name.en === "San Sebastian Cheesecake" && item.price === 190),
  "San Sebastian deep-link target must remain a real 190 ₺ catalog product"
);
assert.ok(
  pairingCategory.items.some((item) => item.id === "cool-lime-macaron-pairing" && item.price === 290),
  "Cool Lime deep-link target must remain the real 290 ₺ pairing"
);

for (const file of ["discover-deck.js", "discover-deck.css"]) {
  assert.ok(existsSync(resolve(root, file)), `${file} must exist`);
}

const html = readFileSync(resolve(root, "discover.html"), "utf8");
assert.match(html, /href="discover-deck\.css\?v=20260909-deck-v1"/);
assert.match(html, /src="discover-deck\.js\?v=20260909-deck-v1"/);

const source = readFileSync(resolve(root, "discover-deck.js"), "utf8");
assert.match(source, /menu-catalog\.js\?v=20260904-premium-order-v1/);
assert.match(source, /discover-journeys-v2\.js/);
assert.match(source, /#next-pairing/);
assert.match(source, /next\.click\(\)/, "Deck preview must delegate selection to existing Discover handler");
assert.match(source, /productRouteForJourney/, "Deck must bind current journey to a verified product route");
assert.doesNotMatch(source, /\b(?:290|370)\b/, "Runtime must not duplicate pairing prices");
assert.doesNotMatch(source, /innerHTML\s*=/, "Deck must build DOM without HTML injection");
assert.doesNotMatch(source, /preventDefault\(/, "Deck must not hijack native page scrolling");
assert.doesNotMatch(source, /addEventListener\(["']scroll["']/, "Deck must not add a scroll handler");

const routeLoader = readFileSync(resolve(root, "menu-product-reveal.js"), "utf8");
assert.ok(
  Buffer.byteLength(routeLoader, "utf8") < 1000,
  "Always-loaded reveal/product-route loader must remain under the existing 1 KB budget"
);
assert.match(routeLoader, /searchParams\.get\("product"\)/);
assert.match(routeLoader, /data-product-id/);
assert.match(routeLoader, /\.full-menu-item-media/);
assert.match(routeLoader, /\.click\(\)/, "Deep-link handoff must delegate to the existing product-card click path");

const css = readFileSync(resolve(root, "discover-deck.css"), "utf8");
assert.match(css, /position:\s*sticky/);
assert.match(css, /touch-action:\s*pan-y/);
assert.match(css, /prefers-reduced-motion:\s*reduce/);

console.log("discover stacked deck + product handoff contract: PASS");
