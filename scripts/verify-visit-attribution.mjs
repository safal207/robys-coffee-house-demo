import { readFileSync } from "node:fs";

const source = readFileSync("analytics.js", "utf8");
const contract = readFileSync("qa/contracts/visit-attribution-v0.md", "utf8");
const sample = JSON.parse(
  readFileSync("qa/fixtures/visit-attribution/pos-orders.sample.json", "utf8")
);

function assert(condition, message) {
  if (!condition) throw new Error(`[VISIT-ATTRIBUTION-001] ${message}`);
}

for (const marker of [
  'productRef: "PROD-ROBYS-WEB"',
  'measurementPlanRef: "MPLAN-ROBYS-MENU-TO-VISIT-001"',
  'storageKey: "robys:visit-intents:v0"',
  'attributionWindowHours: 24',
  'eventName: "visit_intent_created"',
  'mode: "BASELINE"',
  'currency: "TRY"',
  'schemaVersion: "robys-attribution-input.v0"',
  "globalThis.crypto.getRandomValues",
  'document.createElement("dialog")',
  "window.robysVisitAttribution",
  "buildBaselineBundle",
  "campaign_token: intent.campaignToken"
]) {
  assert(source.includes(marker), `Missing required contract marker: ${marker}`);
}

assert(source.includes("/^rv_[a-z0-9]{20}$/"), "Campaign-token format must remain exact");
assert(
  source.includes("retentionMs: 8 * 24 * 60 * 60 * 1000"),
  "Baseline retention must remain bounded"
);
assert(source.includes("maxEvents: 200"), "Visit-intent queue must remain bounded");
assert(!source.includes("Math.random"), "Campaign tokens must never use Math.random");
assert(!source.includes("innerHTML"), "Trusted Types boundary forbids innerHTML");
assert(!source.includes("device_fingerprint"), "Runtime must not collect device fingerprints");
assert(!source.includes("precise_location"), "Runtime must not collect precise location");

for (const field of [
  "orderId",
  "orderedAt",
  "campaignToken",
  "grossRevenue",
  "currency",
  "variableCost"
]) {
  assert(contract.includes(`\`${field}\``), `POS contract is missing ${field}`);
  assert(Object.hasOwn(sample[0], field), `POS sample is missing ${field}`);
}
assert(sample.length === 1, "POS sample must contain one deterministic order");
assert(/^rv_[a-z0-9]{20}$/.test(sample[0].campaignToken), "POS sample token is invalid");
assert(sample[0].currency === "TRY", "POS sample currency must be TRY");

console.log(
  "✅ VISIT-ATTRIBUTION-001 gated: privacy-safe baseline token capture and POS bundle contract are present."
);
