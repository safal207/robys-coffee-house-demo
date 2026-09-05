import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFileSync, rmSync } from "node:fs";

const outfile = ".tmp-smart-choice-revenue-simulator-test.mjs";
await build({
  entryPoints: ["src/smart-choice/revenue-simulator-domain.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile,
  legalComments: "none"
});

const domain = await import(`../${outfile}?v=${Date.now()}`);
const {
  simulateRevenueGrowth,
  validateRevenueSimulationInput,
  exportRevenueSimulationJson,
  exportRevenueSimulationMarkdown,
  formatSimulationMoney,
  deriveAvailableMechanisms
} = domain;

const catalogMechanisms = deriveAvailableMechanisms({
  combos: [
    {
      id: "combo-confirmed-pairing",
      sourceStatus: "confirmed",
      availability: "available",
      pricingMode: "set-price",
      upgrades: [{ id: "upgrade-confirmed" }]
    },
    {
      id: "single-confirmed-item",
      sourceStatus: "confirmed",
      availability: "available",
      pricingMode: "menu-item",
      upgrades: []
    },
    {
      id: "combo-provisional",
      sourceStatus: "provisional",
      availability: "available",
      pricingMode: "set-price",
      upgrades: []
    }
  ],
  bumps: [
    { id: "bump-confirmed", sourceStatus: "confirmed", availability: "available" },
    { id: "bump-unavailable", sourceStatus: "confirmed", availability: "unavailable" }
  ]
});
assert.deepEqual(catalogMechanisms, {
  comboIds: ["combo-confirmed-pairing"],
  upgradeIds: ["upgrade-confirmed"],
  bumpIds: ["bump-confirmed"]
}, "owner mechanisms must include only confirmed pairing combos, never single menu-item candidates");

const baseInput = {
  currency: "TRY",
  locale: "ru-RU",
  currentMonthlyRevenueMinor: 300_000_000,
  monthlyOrders: 10_000,
  averageOrderValueMinor: 30_000,
  targetGrowthBps: 2_000,
  repeatRateBps: 2_000,
  mechanisms: {
    comboIds: ["combo-iced-san-sebastian"],
    upgradeIds: [],
    bumpIds: []
  }
};

try {
  const result = simulateRevenueGrowth(baseInput);
  assert.equal(result.requestedTarget.targetRevenueMinor, 360_000_000, "20% target must equal 3,600,000 TRY");
  assert.equal(result.requestedTarget.gapMinor, 60_000_000, "gap must equal 600,000 TRY");
  assert.equal(result.requestedTarget.additionalOrdersAtCurrentAov, 2_000, "gap must require 2,000 orders at current AOV");
  assert.equal(result.requestedTarget.requiredAovAtCurrentOrdersMinor, 36_000, "fixed orders require 360 TRY AOV");
  assert.equal(result.requestedTarget.requiredAovIncreaseMinor, 6_000, "AOV increase must equal 60 TRY");

  const expected = result.scenarios.find((scenario) => scenario.id === "expected");
  assert.ok(expected, "expected scenario is required");
  assert.equal(expected.projectedRevenueMinor, result.requestedTarget.targetRevenueMinor, "expected scenario must decompose the requested target exactly");
  assert.equal(expected.remainingToRequestedTargetMinor, 0, "expected scenario must leave no arithmetic remainder");
  assert.equal(expected.requirements.reduce((sum, entry) => sum + entry.shareBps, 0), 10_000, "lever shares must sum to 100%");
  assert.ok(expected.requirements.every((entry) => entry.requiredLiftBps > 0), "every expected lever must have an explicit positive lift");
  assert.ok(expected.uncertaintyLowMinor < expected.projectedRevenueMinor, "low range must stay below expected scenario");
  assert.ok(expected.uncertaintyHighMinor > expected.projectedRevenueMinor, "high range must stay above expected scenario");

  const conservative = result.scenarios.find((scenario) => scenario.id === "conservative");
  const stretch = result.scenarios.find((scenario) => scenario.id === "stretch");
  assert.ok(conservative.projectedRevenueMinor < expected.projectedRevenueMinor, "conservative scenario must cover less than expected");
  assert.ok(stretch.projectedRevenueMinor > expected.projectedRevenueMinor, "stretch scenario must exceed expected");

  assert.equal(result.claimLevel, "scenario-only");
  assert.equal(result.automaticPriceChangesAllowed, false);
  assert.equal(result.ownerApprovalRequired, true);
  assert.equal(result.discountPolicy.proposedDiscountBps, 0, "simulator must not propose a discount");
  assert.equal(result.revenueOnlyWarning !== null, true, "missing COGS must produce revenue-only warning");
  assert.ok(result.missingData.includes("average-cogs-per-order"));
  assert.equal(result.hypotheses.find((entry) => entry.id === "combo-discovery")?.status, "eligible");
  assert.equal(result.hypotheses.find((entry) => entry.id === "single-order-bump")?.status, "unavailable");
  assert.ok(result.hypotheses.every((entry) => entry.discountBps === 0), "all hypotheses must preserve zero discount");
  assert.ok(result.hypotheses.every((entry) => entry.primaryMetric && entry.futureExperimentId), "every hypothesis needs a metric and future experiment");

  const replay = simulateRevenueGrowth({
    ...baseInput,
    mechanisms: {
      comboIds: ["combo-iced-san-sebastian"],
      upgradeIds: [],
      bumpIds: []
    }
  });
  assert.equal(exportRevenueSimulationJson(result), exportRevenueSimulationJson(replay), "same input must produce identical versioned JSON");
  assert.equal(result.simulationId, replay.simulationId, "same input must produce the same simulation ID");
  const markdown = exportRevenueSimulationMarkdown(result);
  assert.match(markdown, /scenario-only/);
  assert.match(markdown, /smart-choice-combo-discovery-v1/);
  assert.match(markdown, /not a forecast/i);

  const withCogs = simulateRevenueGrowth({ ...baseInput, averageCogsPerOrderMinor: 12_000 });
  assert.equal(withCogs.revenueOnlyWarning, null);
  assert.ok(withCogs.scenarios.every((scenario) => scenario.financials?.mode === "gross-profit"));
  assert.ok(withCogs.scenarios.every((scenario) => Number.isInteger(scenario.financials.projectedGrossProfitMinor)));
  const cogsMarkdown = exportRevenueSimulationMarkdown(withCogs);
  assert.match(cogsMarkdown, /Gross profit \/ margin/);
  assert.match(cogsMarkdown, /pass|breach/);
  assert.doesNotMatch(cogsMarkdown, /Unavailable — COGS missing/);

  const mismatchInput = { ...baseInput, averageOrderValueMinor: 20_000 };
  const mismatchDiagnostics = validateRevenueSimulationInput(mismatchInput);
  assert.ok(mismatchDiagnostics.some((entry) => entry.code === "SC-SIM-RECONCILIATION-001" && entry.severity === "warning"));
  const mismatch = simulateRevenueGrowth(mismatchInput);
  assert.equal(mismatch.reconciliation.status, "review-required");
  assert.ok(mismatch.missingData.includes("reconciled-orders-and-aov"));

  assert.equal(validateRevenueSimulationInput({ ...baseInput, targetGrowthBps: 1 }).some((entry) => entry.severity === "error"), false);
  assert.equal(validateRevenueSimulationInput({ ...baseInput, targetGrowthBps: 30_000 }).some((entry) => entry.severity === "error"), false);
  assert.ok(validateRevenueSimulationInput({ ...baseInput, targetGrowthBps: 30_001 }).some((entry) => entry.code === "SC-SIM-GROWTH-001"));
  assert.ok(validateRevenueSimulationInput({ ...baseInput, currentMonthlyRevenueMinor: -1 }).some((entry) => entry.code === "SC-SIM-MONEY-001"));
  assert.ok(validateRevenueSimulationInput({ ...baseInput, currency: "₺" }).some((entry) => entry.code === "SC-SIM-CURRENCY-001"));

  const rubResult = simulateRevenueGrowth({ ...baseInput, currency: "RUB" });
  assert.equal(rubResult.currency, "RUB", "currency must be preserved without conversion");
  assert.notEqual(rubResult.requestedTarget.targetRevenueMinor, 0);
  assert.match(formatSimulationMoney(123_456, "RUB", "ru-RU"), /1[\s ]?234,56|1[\s ]?234\.56/);

  const highRepeat = simulateRevenueGrowth({ ...baseInput, repeatRateBps: 9_900, targetGrowthBps: 30_000 });
  assert.ok(highRepeat.scenarios.some((scenario) => scenario.warnings.some((warning) => warning.includes("exceeds 100%"))));

  const source = readFileSync("src/smart-choice/revenue-simulator-domain.ts", "utf8");
  assert.ok(!source.includes("Math.random"), "simulator must remain deterministic");
  assert.ok(!source.includes("fetch("), "domain must not depend on network requests");

  console.log("✅ SMART-CHOICE-REVENUE-SIMULATOR passed: arithmetic, scenarios, guardrails, missing data and exports verified.");
} finally {
  rmSync(outfile, { force: true });
}
