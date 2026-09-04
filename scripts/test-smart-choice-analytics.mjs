import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const temp = await mkdtemp(path.join(tmpdir(), "robys-analytics-"));
try {
  const domainOut = path.join(temp, "analytics-domain.mjs");
  const dedupeOut = path.join(temp, "analytics-dedupe.mjs");
  await build({
    entryPoints: ["src/smart-choice/analytics-domain.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    outfile: domainOut,
    legalComments: "none"
  });
  await build({
    entryPoints: ["src/smart-choice/analytics-dedupe.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    outfile: dedupeOut,
    legalComments: "none"
  });

  const domain = await import(`${pathToFileURL(domainOut).href}?v=${Date.now()}`);
  const dedupe = await import(`${pathToFileURL(dedupeOut).href}?v=${Date.now()}`);
  const sessionId = "sc_0123456789abcdef0123456789abcdef";
  const startedAtMs = 1_000_000;
  let sequence = 1;
  const events = [];

  function append(draft, offsetMs) {
    const event = domain.createSmartChoiceEvent(
      { sessionId, startedAtMs, nextSequence: sequence },
      { locale: "ru", occurredAtMs: startedAtMs + offsetMs, ...draft }
    );
    sequence += 1;
    events.push(event);
    assert.deepEqual(domain.validateSmartChoiceEvent(event), []);
    return event;
  }

  append({ name: "smart_choice_viewed", fromState: "S0", toState: "S0" }, 0);
  assert.equal(
    events[0].configVersion,
    "smart-choice-recommendation-config.v0.2.0",
    "analytics must distinguish the party-size hard-constraint decision logic"
  );
  append({ name: "smart_choice_started", fromState: "S0", toState: "S1" }, 1_000);
  append({ name: "question_answered", fromState: "S1", toState: "S1", questionId: "intent", answerCode: "coffee" }, 2_000);
  append({ name: "question_answered", fromState: "S1", toState: "S1", questionId: "temperature", answerCode: "cold" }, 3_000);
  append({ name: "question_answered", fromState: "S1", toState: "S1", questionId: "taste", answerCode: "sweet" }, 4_000);
  append({ name: "question_answered", fromState: "S1", toState: "S1", questionId: "partySize", answerCode: "one" }, 5_000);
  append({ name: "question_answered", fromState: "S1", toState: "S2", questionId: "budgetKey", answerCode: "400" }, 6_000);
  append({ name: "recommendations_shown", fromState: "S2", toState: "S3", recommendationId: "combo-iced-san-sebastian" }, 7_000);
  append({
    name: "recommendation_selected",
    fromState: "S3",
    toState: "S4",
    recommendationId: "combo-iced-san-sebastian",
    basketBeforeMinor: 0,
    basketAfterMinor: 37_000
  }, 8_000);
  append({
    name: "bump_shown",
    fromState: "S4",
    toState: "S4",
    ruleId: "bump-takeaway-macaron",
    basketBeforeMinor: 37_000,
    basketAfterMinor: 37_000
  }, 9_000);
  append({
    name: "bump_accepted",
    fromState: "S4",
    toState: "S5",
    ruleId: "bump-takeaway-macaron",
    basketBeforeMinor: 37_000,
    basketAfterMinor: 40_000
  }, 10_000);
  append({
    name: "order_handoff_started",
    fromState: "S5",
    toState: "S6",
    recommendationId: "combo-iced-san-sebastian",
    basketBeforeMinor: 40_000,
    basketAfterMinor: 40_000
  }, 11_000);

  assert.deepEqual(domain.reconstructJourney(events), []);
  assert.equal(domain.stableSerializeEvent(events[0]), domain.stableSerializeEvent({ ...events[0] }));

  const metrics = domain.calculateFunnelMetrics(events);
  assert.equal(metrics.eligibleSessions, 1);
  assert.equal(metrics.startRate, 1);
  assert.equal(metrics.completionRate, 1);
  assert.equal(metrics.recommendationAcceptanceRate, 1);
  assert.equal(metrics.bumpAcceptanceRate, 1);
  assert.equal(metrics.handoffRate, 1);
  assert.equal(metrics.medianTimeToChoiceMs, 8_000);
  assert.equal(metrics.averageRecommendedBasketMinor, 37_000);
  assert.equal(metrics.averageHandoffBasketMinor, 40_000);
  assert.equal(metrics.incrementalBasketFromBumpMinor, 3_000);

  const memory = new domain.MemoryAnalyticsSink();
  events.forEach((event) => memory.publish(event));
  assert.equal(memory.events.length, events.length);

  const withPhone = { ...events[0], phone: "+90 555 123 45 67" };
  assert(domain.validateSmartChoiceEvent(withPhone).some((entry) => entry.code === "SC-ANALYTICS-SCHEMA-002"));
  const withFreeText = { ...events[2], answerCode: "call me tomorrow please" };
  assert(domain.validateSmartChoiceEvent(withFreeText).some((entry) => entry.code === "SC-ANALYTICS-CODE-001"));
  const invalidTransition = { ...events[8], fromState: "S1" };
  assert(domain.validateSmartChoiceEvent(invalidTransition).some((entry) => entry.code === "SC-ANALYTICS-TRANSITION-001"));

  const first = dedupe.registerEventDedupeKey([], "recommendations:coffee:cold");
  assert.equal(first.accepted, true);
  const repeated = dedupe.registerEventDedupeKey(first.keys, "recommendations:coffee:cold");
  assert.equal(repeated.accepted, false, "repeated render must not create another semantic event");

  const runtimeSource = await readFile("src/smart-choice/analytics.ts", "utf8");
  const html = await readFile("smart-choice/index.html", "utf8");
  const buildSource = await readFile("scripts/build.mjs", "utf8");
  assert(runtimeSource.includes("SessionDebugSink"));
  assert(runtimeSource.includes("CallbackAnalyticsAdapter"));
  assert(runtimeSource.includes("MutationObserver"));
  assert(runtimeSource.includes("dedupeKey"));
  assert(runtimeSource.includes("bump-skipped-by-handoff"));
  assert(html.includes('src="analytics-v2.js?v='), "Smart Choice HTML must load a cache-new revisioned analytics bundle");
  assert(buildSource.includes('entryPoints: ["src/smart-choice/analytics.ts"]'));
  assert(buildSource.includes('revisionFor("smart-choice/analytics-v2.js")'));
  assert(!runtimeSource.includes("innerHTML"));
  assert(!runtimeSource.includes("fetch("));
  assert(!runtimeSource.includes("phoneNumber"));
  assert(!runtimeSource.includes("emailAddress"));

  console.log("✅ SMART-CHOICE-ANALYTICS passed: strict event schema, PII rejection, render dedupe, S0–S6 reconstruction, local sink, adapters, revisioned runtime asset and funnel formulas verified.");
} finally {
  await rm(temp, { recursive: true, force: true });
}
