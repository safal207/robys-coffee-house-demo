import assert from "node:assert/strict";
import { menuCategories } from "../menu-data.js";
import { journeys } from "../discover-journeys-v2.js";

const pairingCategory = menuCategories.find((category) => category.id === "pairing-offers");
assert.ok(pairingCategory, "pairing-offers category is missing");

const offers = pairingCategory.items ?? [];
assert.ok(offers.length >= 2, "pairing destination must expose at least two active offers");

const journeyIds = journeys.map((journey) => journey.id);
const journeyById = new Map(journeys.map((journey) => [journey.id, journey]));
const offerIds = offers.map((offer) => offer.journeyId);

assert.equal(new Set(journeyIds).size, journeyIds.length, "Discover journeys contain duplicate ids");
assert.equal(new Set(offerIds).size, offerIds.length, "menu pairing offers contain duplicate journeyId values");
assert.deepEqual([...offerIds].sort(), [...journeyIds].sort(), "menu pairing offers must match Discover journeys exactly");

for (const offer of offers) {
  assert.equal(typeof offer.journeyId, "string", `${offer.id}: journeyId is required`);
  const journey = journeyById.get(offer.journeyId);
  assert.ok(journey, `${offer.id}: referenced journey does not exist`);
  assert.deepEqual(offer.name, journey.title, `${offer.id}: localized title drifted from Discover`);
  assert.ok(Number.isInteger(offer.price) && offer.price > 0, `${offer.id}: price must be a positive integer`);
  assert.ok(menuCategories.some((category) => category.id === journey.primary.category), `${offer.id}: primary category is missing from menu`);
  assert.ok(menuCategories.some((category) => category.id === journey.companion.category), `${offer.id}: companion category is missing from menu`);
}

const icedOffer = offers.find((offer) => offer.journeyId === "iced-san-sebastian");
assert.equal(icedOffer?.price, 370, "Iced Latte + San Sebastian must use the current 180 + 190 menu total");

console.log(`✅ PAIRING-CATALOG-001: ${offers.length} menu offers exactly match ${journeyIds.length} Discover journeys.`);
