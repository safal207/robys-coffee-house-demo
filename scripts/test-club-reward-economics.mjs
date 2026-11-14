import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateRewards } from "./club-reward-economics.mjs";

const sample = {
  "paidOrders": 100,
  "incrementalPaidOrders": 10,
  "averageNetSalesMinor": 18000,
  "averageCogsMinor": 7000,
  "rewardNetPriceMinor": 11000,
  "rewardCogsMinor": 4000,
  "issuedRewards": 10,
  "expectedRedemptions": 5,
  "expectedDisplacedSales": 2,
  "otherProgramCostMinor": 0,
  "maxExposureMinor": 120000
};

test("illustrative economics reconcile expected and full-issuance exposure", () => {
  const result = simulateRewards(sample);
  assert.equal(result.status, "planning-only");
  assert.equal(result.baselineContributionMinor, 1100000);
  assert.equal(result.scenarioRewardExpenseMinor, 34000);
  assert.equal(result.scenarioIncrementalContributionMinor, 76000);
  assert.equal(result.scenarioContributionMinor, 1176000);
  assert.equal(result.maximumExposureMinor, 110000);
  assert.equal(result.zeroUpliftStressDeltaMinor, -110000);
  assert.equal(result.breakEvenAdditionalOrders, 4);
  assert.equal(result.stressBreakEvenAdditionalOrders, 10);
});
test("missing actual cost suppresses financial conclusions", () => {
  const result = simulateRewards({...sample, averageCogsMinor: null, rewardCogsMinor: undefined});
  assert.deepEqual(result, {status:"missing-data", missing:["averageCogsMinor","rewardCogsMinor"]});
});
test("all-redeemed exposure cap applies even when expected scenario earns money", () => {
  const result = simulateRewards({...sample, maxExposureMinor: 100000});
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.includes("exposure-cap-exceeded"));
});
test("nonpositive contribution or zero uplift cannot silently become profitable", () => {
  const loss = simulateRewards({...sample, incrementalPaidOrders:0});
  assert.equal(loss.status,"blocked");
  assert.equal(loss.scenarioIncrementalContributionMinor,-34000);
  const unprofitable = simulateRewards({...sample, averageCogsMinor:18000});
  assert.equal(unprofitable.status,"blocked");
  assert.equal(unprofitable.breakEvenAdditionalOrders,null);
});
test("unsafe values, impossible counts and fractional money rejected", () => {
  for (const change of [{expectedDisplacedSales:6},{expectedRedemptions:11},{rewardCogsMinor:-1},{averageNetSalesMinor:1.5},{paidOrders:0},{paidOrders:Number.MAX_SAFE_INTEGER},{issuedRewards:"10"}]) {
    assert.throws(()=>simulateRewards({...sample,...change}),RangeError);
  }
});
test("full redemption of displaced sales and zero rewards remain well defined", () => {
  const full=simulateRewards({...sample,expectedRedemptions:10,expectedDisplacedSales:10});
  assert.equal(full.scenarioRewardExpenseMinor,full.maximumExposureMinor);
  const noRewards=simulateRewards({...sample,issuedRewards:0,expectedRedemptions:0,expectedDisplacedSales:0,incrementalPaidOrders:0});
  assert.equal(noRewards.maximumExposureMinor,0);
  assert.equal(noRewards.scenarioIncrementalContributionMinor,0);
});
