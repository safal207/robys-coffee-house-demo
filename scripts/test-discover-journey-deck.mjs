import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { menuCategories } from "../menu-catalog.js";
import { journeys } from "../discover-journeys-v2.js";

const expectedIds = ["cool-lime-macaron", "iced-san-sebastian"];
assert.deepEqual(
  journeys.map((journey) => journey.id),
  expectedIds,
  "Deck must stay bounded to the two currently active Taste Journey entries"
);

const pairingCategory = menuCategories.find((category) => category.id === "pairing-offers");
assert.ok(pairingCategory?.items, "Pairing offers category must exist");

const expectedOffers = new Map([
  ["cool-lime-macaron", { price: 290, image: "src/products/sets-v1/cool-lime-macaron.webp" }],
  ["iced-san-sebastian", { price: 370, image: "src/products/sets-v1/iced-san-sebastian.webp" }]
]);

for (const journey of journeys) {
  const offer = pairingCategory.items.find((item) => item.journeyId === journey.id);
  assert.ok(offer, `${journey.id}: missing catalog pairing offer`);
  const expected = expectedOffers.get(journey.id);
  assert.equal(offer.price, expected.price, `${journey.id}: catalog price drifted`);
  assert.equal(offer.image, expected.image, `${journey.id}: catalog image drifted`);
  assert.ok(existsSync(offer.image), `${journey.id}: pairing image must exist in repository`);
  for (const language of ["tr", "en", "ru"]) {
    assert.ok(offer.name?.[language], `${journey.id}: ${language} name missing`);
    assert.ok(journey.reason?.[language], `${journey.id}: ${language} reason missing`);
  }
}

const html = readFileSync("discover.html", "utf8");
assert.match(html, /id="journey-deck"[^>]*role="list"[^>]*hidden/, "Discover must provide a fail-closed deck mount");

const runtime = readFileSync("discover-v2.js", "utf8");
assert.match(runtime, /pairingOffer\(journeyId\)/, "Deck must resolve pairings from menu catalog");
assert.match(runtime, /entries\.length!==2/, "Deck must fail closed unless both verified candidates are available");
assert.doesNotMatch(runtime, /\b(?:290|370)\b/, "Deck runtime must not duplicate catalog prices");
assert.doesNotMatch(runtime, /\b(?:Morning|Sweet|Lunch|For Two)\b/, "Deck must not invent unverified scenario labels");
assert.doesNotMatch(runtime, /addToCart|setCartQuantity/, "Deck must not duplicate menu checkout logic");

const css = readFileSync("discover-rotation.css", "utf8");
assert.match(css, /\.journey-deck-item\s*\{[^}]*position:\s*sticky/s, "Mobile deck must use native sticky positioning");
assert.match(css, /data-deck-index="1"[^}]*top:\s*92px/s, "Second deck card must keep the verified 16 px desktop-mobile stack offset");
assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*position:\s*relative/, "Reduced motion must disable sticky stacking");

console.log("discover journey deck contract: PASS");
