import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const temp = await mkdtemp(path.join(tmpdir(), "robys-experiments-"));
try {
  const outfile = path.join(temp, "experiment-domain.mjs");
  await build({
    entryPoints: ["src/smart-choice/experiment-domain.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    outfile,
    legalComments: "none"
  });
  const domain = await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);

  const definition = domain.SMART_CHOICE_EXPERIMENTS[0];
  assert(definition, "active experiment fixture must exist");
  assert.deepEqual(domain.validateExperimentDefinition(definition), []);
  assert.equal(definition.primaryMetric, "handoff-rate");
  assert.equal(definition.commerce.pricesIdenticalAcrossVariants, true);
  assert.equal(definition.commerce.availabilityIdenticalAcrossVariants, true);

  const assignmentA = domain.assignExperiment(definition, "session_seed_alpha");
  const assignmentB = domain.assignExperiment(definition, "session_seed_alpha");
  assert.deepEqual(assignmentA, assignmentB, "assignment must be stable for the anonymous session seed");
  assert(assignmentA, "enabled experiment must produce an assignment");
  assert.equal(domain.assignmentMatchesDefinition(assignmentA, definition), true);
  assert.equal(domain.assignExperiment(definition, "session_seed_alpha", { globalKillSwitch: true }), null);
  assert.equal(domain.assignExperiment({ ...definition, killSwitch: true }, "session_seed_alpha"), null);

  const assignedVariants = new Set();
  for (let index = 0; index < 200; index += 1) {
    const assignment = domain.assignExperiment(definition, `session_seed_${index}`);
    if (assignment) assignedVariants.add(assignment.variantId);
  }
  assert.deepEqual([...assignedVariants].sort(), definition.variants.map((variant) => variant.id).sort());

  const forbiddenPricingOverride = structuredClone(definition);
  forbiddenPricingOverride.variants[1].payload.priceMinor = 1;
  assert(domain.validateExperimentDefinition(forbiddenPricingOverride).some((error) => error.includes("forbidden payload key: priceMinor")));

  const parityViolation = structuredClone(definition);
  parityViolation.commerce.pricesIdenticalAcrossVariants = false;
  assert(domain.validateExperimentDefinition(parityViolation).some((error) => error.includes("share prices and availability")));

  const socialProof = domain.SMART_CHOICE_EXPERIMENTS[1];
  assert(domain.validateExperimentDefinition(socialProof).some((error) => error.includes("verified evidence ID")));
  const verifiedSocialProof = { ...socialProof, verifiedSocialProofEvidenceId: "evidence-popularity-2026-07" };
  assert.deepEqual(domain.validateExperimentDefinition(verifiedSocialProof), []);

  const baseControl = {
    variantId: definition.controlVariantId,
    sessions: 1_000,
    exposureDays: 14,
    ctaClicks: 500,
    completedRecommendations: 500,
    handoffs: 200,
    bumpShown: 160,
    bumpAccepted: 40,
    medianTimeToChoiceMs: 30_000,
    revenueMinor: 10_000_000,
    grossProfitMinor: 6_000_000,
    discountMinor: 400_000,
    listRevenueMinor: 10_400_000
  };
  const treatmentVariant = definition.variants.find((variant) => variant.role === "treatment");
  assert(treatmentVariant);
  const baseTreatment = {
    variantId: treatmentVariant.id,
    sessions: 1_000,
    exposureDays: 14,
    ctaClicks: 650,
    completedRecommendations: 600,
    handoffs: 300,
    bumpShown: 190,
    bumpAccepted: 60,
    medianTimeToChoiceMs: 35_000,
    revenueMinor: 11_000_000,
    grossProfitMinor: 7_000_000,
    discountMinor: 500_000,
    listRevenueMinor: 11_500_000
  };

  const analysisInput = {
    definition,
    control: baseControl,
    treatment: baseTreatment,
    randomizedAssignment: true,
    eventSchemaVersion: "robys.smart-choice-event.v1",
    catalogVersion: definition.commerce.catalogVersion,
    pricingFingerprint: definition.commerce.pricingFingerprint,
    availabilityFingerprint: definition.commerce.availabilityFingerprint
  };

  const positive = domain.analyzeExperiment(analysisInput);
  assert.equal(positive.decision, "candidate-for-human-review");
  assert.equal(positive.uncertainty.causalClaim, "eligible-for-human-causal-review");
  assert(positive.primary.observedAbsoluteLiftBps > 0);
  assert(positive.primary.confidence95LowerBps > 0);
  assert(positive.guardrails.every((guardrail) => guardrail.status === "pass"));

  const insufficient = domain.analyzeExperiment({
    ...analysisInput,
    control: { ...baseControl, sessions: 30, handoffs: 5, exposureDays: 2 },
    treatment: { ...baseTreatment, sessions: 30, handoffs: 7, exposureDays: 2 }
  });
  assert.equal(insufficient.decision, "insufficient-sample");
  assert.equal(insufficient.sample.sufficient, false);

  const missingFinance = domain.analyzeExperiment({
    ...analysisInput,
    control: { ...baseControl, revenueMinor: undefined, grossProfitMinor: undefined, discountMinor: undefined, listRevenueMinor: undefined },
    treatment: { ...baseTreatment, revenueMinor: undefined, grossProfitMinor: undefined, discountMinor: undefined, listRevenueMinor: undefined }
  });
  assert.equal(missingFinance.decision, "financial-data-required");
  assert(missingFinance.guardrails.some((guardrail) => guardrail.id === "gross-margin" && guardrail.status === "unavailable"));

  const clicksUpHandoffDown = domain.analyzeExperiment({
    ...analysisInput,
    treatment: { ...baseTreatment, ctaClicks: 900, handoffs: 140 }
  });
  assert.equal(clicksUpHandoffDown.decision, "guardrail-breach");
  assert(clicksUpHandoffDown.guardrails.some((guardrail) => guardrail.id === "handoff-conversion" && guardrail.status === "breach"));
  assert.notEqual(clicksUpHandoffDown.decision, "winner");

  const lowMargin = domain.analyzeExperiment({
    ...analysisInput,
    treatment: { ...baseTreatment, grossProfitMinor: 4_000_000 }
  });
  assert.equal(lowMargin.decision, "guardrail-breach");
  assert(lowMargin.guardrails.some((guardrail) => guardrail.id === "gross-margin" && guardrail.status === "breach"));

  const excessiveDiscount = domain.analyzeExperiment({
    ...analysisInput,
    treatment: { ...baseTreatment, discountMinor: 2_000_000 }
  });
  assert.equal(excessiveDiscount.decision, "guardrail-breach");
  assert(excessiveDiscount.guardrails.some((guardrail) => guardrail.id === "discount" && guardrail.status === "breach"));

  const negativeProfit = domain.analyzeExperiment({
    ...analysisInput,
    treatment: { ...baseTreatment, grossProfitMinor: 5_000_000 }
  });
  assert.equal(negativeProfit.decision, "guardrail-breach");
  assert(negativeProfit.guardrails.some((guardrail) => guardrail.id === "incremental-gross-profit" && guardrail.status === "breach"));

  const slower = domain.analyzeExperiment({
    ...analysisInput,
    treatment: { ...baseTreatment, medianTimeToChoiceMs: 50_001 }
  });
  assert.equal(slower.decision, "guardrail-breach");
  assert(slower.guardrails.some((guardrail) => guardrail.id === "time-to-choice" && guardrail.status === "breach"));

  const commerceMismatch = domain.analyzeExperiment({
    ...analysisInput,
    pricingFingerprint: "fnv1a32-deadbeef"
  });
  assert.equal(commerceMismatch.decision, "guardrail-breach");
  assert(commerceMismatch.guardrails.some((guardrail) => guardrail.id === "commerce-parity" && guardrail.status === "breach"));

  const inconclusive = domain.analyzeExperiment({
    ...analysisInput,
    treatment: { ...baseTreatment, handoffs: 205 }
  });
  assert.equal(inconclusive.decision, "inconclusive");
  assert.equal(inconclusive.uncertainty.causalClaim, "not-established");

  const nonRandomized = domain.analyzeExperiment({ ...analysisInput, randomizedAssignment: false });
  assert.equal(nonRandomized.decision, "candidate-for-human-review");
  assert.equal(nonRandomized.uncertainty.causalClaim, "not-established");

  const killed = domain.analyzeExperiment({ ...analysisInput, definition: { ...definition, killSwitch: true } });
  assert.equal(killed.decision, "kill-switched");

  const domainSource = await readFile("src/smart-choice/experiment-domain.ts", "utf8");
  const runtimeSource = await readFile("src/smart-choice/experiments.ts", "utf8");
  const analyticsSource = await readFile("src/smart-choice/analytics.ts", "utf8");
  const html = await readFile("smart-choice/index.html", "utf8");
  const buildSource = await readFile("scripts/build.mjs", "utf8");

  assert(!domainSource.includes("document."), "experiment analysis domain must not read DOM state");
  assert(!domainSource.includes("sessionStorage"), "experiment analysis domain must not read browser storage");
  assert(!runtimeSource.includes("fetch("), "MVP experiment runtime must not depend on an external endpoint");
  assert(
    runtimeSource.includes("if (lead.textContent !== nextCopy) lead.textContent = nextCopy"),
    "experiment copy writes must be idempotent inside the observed Smart Choice subtree"
  );
  for (const stalePromise of [
    "doğrulanmış bir Roby's eşleşmesi",
    "verified Roby's pairing",
    "подтверждённое сочетание Roby's"
  ]) {
    assert(!runtimeSource.includes(stalePromise), `single-item recommendations must not be described as pairing-only: ${stalePromise}`);
  }
  for (const honestPromise of [
    "doğrulanmış bir Roby's seçimi",
    "verified Roby's menu choice",
    "подтверждённую позицию или сочетание Roby's"
  ]) {
    assert(runtimeSource.includes(honestPromise), `experiment copy must cover a menu item or pairing: ${honestPromise}`);
  }
  assert(runtimeSource.includes("ANALYTICS_ASSIGNMENT_KEY"));
  assert(runtimeSource.includes("killSwitch"));
  assert(analyticsSource.includes('const EXPERIMENT_KEY = "robys-smart-choice-experiment.v1"'));
  assert(html.indexOf('src="experiments-v2.js') < html.indexOf('src="analytics-v2.js'), "experiment assignment must load before analytics");
  assert(buildSource.includes('entryPoints: ["src/smart-choice/experiments.ts"]'));
  assert(buildSource.includes('revisionFor("smart-choice/experiments-v2.js")'));

  console.log("✅ SMART-CHOICE-EXPERIMENTS passed: stable anonymous assignment, commerce parity, minimum sample, uncertainty, kill switch and financial guardrails verified.");
} finally {
  await rm(temp, { recursive: true, force: true });
}
