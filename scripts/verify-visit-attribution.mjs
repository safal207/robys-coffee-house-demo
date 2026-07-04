import { readFileSync } from "node:fs";

const source = readFileSync("analytics.js", "utf8");
const adapter = readFileSync("scripts/build-baseline-from-pos.mjs", "utf8");
const contract = readFileSync("qa/contracts/visit-attribution-v0.md", "utf8");
const sample = JSON.parse(readFileSync("qa/fixtures/visit-attribution/pos-orders.sample.json", "utf8"));
const expected = JSON.parse(readFileSync("qa/fixtures/visit-attribution/baseline-bundle.expected.json", "utf8"));

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
  "TOKEN_TIMESTAMP_WIDTH = 7",
  "TOKEN_RANDOM_WIDTH = 13",
  "encodeCampaignTimestamp",
  "timestampFromCampaignToken",
  "eventIdForCampaignToken",
  'document.createElement("dialog")',
  "window.robysVisitAttribution",
  "buildBaselineBundle",
  "normalizePosOrder",
  "contains missing or unknown fields",
  "OFFSET_DATE_TIME_RE",
  "MONEY_RE",
  "campaign_token: intent.campaignToken"
]) {
  assert(source.includes(marker), `Missing required website contract marker: ${marker}`);
}

for (const marker of [
  "timestampFromCampaignToken",
  "visitIntentFromCampaignToken",
  "deduplicatePosOrders",
  "deterministicRunId",
  'mode: "BASELINE"',
  "measurementPlanRef: MEASUREMENT_PLAN_REF",
  'createHash("sha256")',
  "conflicting duplicate orderId"
]) {
  assert(adapter.includes(marker), `Missing required POS adapter marker: ${marker}`);
}

assert(source.includes("/^rv_[a-z0-9]{20}$/"), "Campaign-token format must remain exact");
assert(source.includes("retentionMs: 8 * 24 * 60 * 60 * 1000"), "Baseline retention must remain bounded");
assert(source.includes("maxEvents: 200"), "Visit-intent queue must remain bounded");
assert(!source.includes("Math.random"), "Campaign tokens must never use Math.random");
assert(!source.includes("innerHTML"), "Trusted Types boundary forbids innerHTML");
assert(!source.includes("device_fingerprint"), "Runtime must not collect device fingerprints");
assert(!source.includes("precise_location"), "Runtime must not collect precise location");

for (const field of ["orderId", "orderedAt", "campaignToken", "grossRevenue", "currency", "variableCost"]) {
  assert(contract.includes(`\`${field}\``), `POS contract is missing ${field}`);
  assert(Object.hasOwn(sample[0], field), `POS sample is missing ${field}`);
}
assert(sample.length === 1, "POS sample must contain one deterministic order");
assert(/^rv_[a-z0-9]{20}$/.test(sample[0].campaignToken), "POS sample token is invalid");
assert(sample[0].currency === "TRY", "POS sample currency must be TRY");
assert(expected.webEvents.length === 1, "Expected bundle must reconstruct one web event");
assert(expected.posOrders.length === 1, "Expected bundle must contain one POS order");
assert(expected.webEvents[0].campaignToken === sample[0].campaignToken, "Expected web event must bind the POS token");
assert(expected.webEvents[0].occurredAt === "2026-07-04T13:00:00.000Z", "Sample token timestamp must decode deterministically");
assert(expected.mode === "BASELINE", "Expected bundle must remain baseline-only");
assert(expected.attributionWindowHours === 24, "Expected bundle must remain bound to 24 hours");

console.log(
  "✅ VISIT-ATTRIBUTION-001 gated: self-describing tokens, privacy-safe POS bridge, and LS baseline bundle are present."
);
