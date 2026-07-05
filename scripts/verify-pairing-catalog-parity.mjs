import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { menuCategories } from "../menu-data.js";
import { journeys } from "../discover-journeys-v2.js";

const baseline = JSON.parse(readFileSync("qa/menu-content-baseline.json", "utf8"));
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

function categoryItems(categoryId) {
  const category = menuCategories.find((candidate) => candidate.id === categoryId);
  assert.ok(category, `missing menu category: ${categoryId}`);
  return category.items ?? (category.groups ?? []).flatMap((group) => group.items ?? []);
}

function productPrice(product) {
  const item = categoryItems(product.category).find((candidate) => candidate.name?.en === product.name);
  assert.ok(item, `${product.category}: product ${product.name} is missing`);
  assert.ok(Number.isInteger(item.price) && item.price > 0, `${product.name}: component price must be positive`);
  return item.price;
}

for (const offer of offers) {
  assert.equal(typeof offer.journeyId, "string", `${offer.id}: journeyId is required`);
  const journey = journeyById.get(offer.journeyId);
  assert.ok(journey, `${offer.id}: referenced journey does not exist`);
  assert.deepEqual(offer.name, journey.title, `${offer.id}: localized title drifted from Discover`);
  assert.ok(Number.isInteger(offer.price) && offer.price > 0, `${offer.id}: price must be a positive integer`);

  const baselineKey = `pairing-offers::${offer.name.tr}`;
  const approvedPrice = baseline.prices?.[baselineKey];
  assert.ok(Number.isInteger(approvedPrice), `${offer.id}: verified baseline price is missing`);
  assert.equal(offer.price, approvedPrice, `${offer.id}: price drifted from verified menu baseline`);

  const componentTotal = productPrice(journey.primary) + productPrice(journey.companion);
  if (offer.pricingMode === "menu-total") {
    assert.equal(offer.price, componentTotal, `${offer.id}: menu-total price must follow current component prices`);
  } else {
    assert.equal(offer.pricingMode, "approved-offer", `${offer.id}: unsupported pricingMode`);
    assert.match(baseline.source, /approved/i, `${offer.id}: approved-offer requires approved source evidence`);
  }
}

console.log(`✅ PAIRING-CATALOG-001: ${offers.length} offers match Discover identities and verified pricing policies.`);
