import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PosBaselineError,
  buildBaselineBundle,
  timestampFromCampaignToken,
  visitIntentFromCampaignToken
} from "./build-baseline-from-pos.mjs";

const samplePath = new URL("../qa/fixtures/visit-attribution/pos-orders.sample.json", import.meta.url);
const expectedPath = new URL("../qa/fixtures/visit-attribution/baseline-bundle.expected.json", import.meta.url);
const sample = JSON.parse(readFileSync(samplePath, "utf8"));
const expected = JSON.parse(readFileSync(expectedPath, "utf8"));

assert.deepEqual(buildBaselineBundle(sample), expected);
assert.deepEqual(buildBaselineBundle(sample), buildBaselineBundle(sample));
assert.equal(
  timestampFromCampaignToken("rv_0thnis0abcdefghijklm"),
  Date.parse("2026-07-04T13:00:00.000Z")
);
assert.deepEqual(visitIntentFromCampaignToken("rv_0thnis0abcdefghijklm"), expected.webEvents[0]);

const duplicated = [...sample, structuredClone(sample[0])];
assert.equal(buildBaselineBundle(duplicated).posOrders.length, 1);
assert.equal(buildBaselineBundle(duplicated).webEvents.length, 1);

const conflicting = [...sample, { ...sample[0], grossRevenue: "301.00" }];
assert.throws(() => buildBaselineBundle(conflicting), /conflicting duplicate orderId/);

assert.throws(() => buildBaselineBundle({}), /JSON array/);
assert.throws(
  () => buildBaselineBundle([{ ...sample[0], customerName: "not-allowed" }]),
  /missing or unknown fields/
);
assert.throws(
  () => buildBaselineBundle([{ ...sample[0], campaignToken: "invalid" }]),
  /campaignToken is invalid/
);
assert.throws(
  () => buildBaselineBundle([{ ...sample[0], orderedAt: "2026-07-04T16:30:00" }]),
  /date-time with offset/
);
assert.throws(
  () => buildBaselineBundle([{ ...sample[0], currency: "USD" }]),
  /currency must be TRY/
);
assert.throws(
  () => buildBaselineBundle([{ ...sample[0], grossRevenue: "300.000" }]),
  /grossRevenue is invalid/
);
assert.throws(
  () => buildBaselineBundle([{ ...sample[0], variableCost: 140 }]),
  /variableCost is invalid/
);
assert.throws(() => timestampFromCampaignToken("invalid"), PosBaselineError);

const second = {
  ...sample[0],
  orderId: "ord_robys_0002",
  orderedAt: "2026-07-04T16:45:00+03:00"
};
const sharedTokenBundle = buildBaselineBundle([sample[0], second]);
assert.equal(sharedTokenBundle.posOrders.length, 2);
assert.equal(sharedTokenBundle.webEvents.length, 1);

console.log(
  "✅ VISIT-ATTRIBUTION-003 passed: POS-only export reconstructs deterministic LS baseline evidence."
);
