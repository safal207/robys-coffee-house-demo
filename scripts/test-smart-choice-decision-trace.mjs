import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const temp = await mkdtemp(path.join(tmpdir(), "robys-decision-trace-"));
try {
  const outfile = path.join(temp, "decision-trace-suite.mjs");
  await build({
    entryPoints: ["src/smart-choice/decision-trace-domain.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    outfile,
    legalComments: "none"
  });
  const domain = await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);

  const engineOut = path.join(temp, "engine.mjs");
  await build({
    entryPoints: ["src/smart-choice/engine.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    outfile: engineOut,
    legalComments: "none"
  });
  const engine = await import(`${pathToFileURL(engineOut).href}?v=${Date.now()}`);

  const analyticsOut = path.join(temp, "analytics-domain.mjs");
  await build({
    entryPoints: ["src/smart-choice/analytics-domain.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    outfile: analyticsOut,
    legalComments: "none"
  });
  const analytics = await import(`${pathToFileURL(analyticsOut).href}?v=${Date.now()}`);

  const input = {
    intent: "coffee",
    temperature: "cold",
    taste: "sweet",
    partySize: "one",
    budget: { minMinor: 25_001, maxMinor: 40_000 },
    locale: "ru"
  };
  const result = engine.recommendSmartChoice(input);
  assert.equal(result.status, "ok");
  assert(result.top, "fixture must produce a top recommendation");
  const resultBefore = JSON.stringify(result);

  const sessionId = "sc_0123456789abcdef0123456789abcdef";
  const startedAtMs = 2_000_000;
  let sequence = 1;
  const events = [];
  const append = (draft, offsetMs) => {
    events.push(analytics.createSmartChoiceEvent(
      { sessionId, startedAtMs, nextSequence: sequence++ },
      { locale: "ru", occurredAtMs: startedAtMs + offsetMs, ...draft }
    ));
  };

  append({ name: "smart_choice_viewed", fromState: "S0", toState: "S0" }, 0);
  append({ name: "smart_choice_started", fromState: "S0", toState: "S1" }, 1_000);
  append({ name: "question_answered", fromState: "S1", toState: "S2", questionId: "budgetKey", answerCode: "400" }, 2_000);
  append({ name: "recommendations_shown", fromState: "S2", toState: "S3", recommendationId: result.top.candidateId }, 3_000);
  append({
    name: "recommendation_selected",
    fromState: "S3",
    toState: "S4",
    recommendationId: result.top.candidateId,
    basketBeforeMinor: 0,
    basketAfterMinor: result.top.priceMinor
  }, 4_000);
  append({
    name: "bump_declined",
    fromState: "S4",
    toState: "S5",
    ruleId: "bump-takeaway-macaron",
    basketBeforeMinor: result.top.priceMinor,
    basketAfterMinor: result.top.priceMinor
  }, 5_000);
  append({
    name: "order_handoff_started",
    fromState: "S5",
    toState: "S6",
    recommendationId: result.top.candidateId,
    basketBeforeMinor: result.top.priceMinor,
    basketAfterMinor: result.top.priceMinor
  }, 6_000);

  const traceA = domain.buildDecisionTrace(result, events);
  const traceB = domain.buildDecisionTrace(result, events);
  assert.deepEqual(domain.validateDecisionTrace(traceA), []);
  assert.equal(domain.readDecisionTrace(traceA).ok, true, "the current trace schema must be readable");
  assert.equal(domain.stableSerializeDecisionTrace(traceA), domain.stableSerializeDecisionTrace(traceB));
  assert.equal(traceA.traceId, traceB.traceId, "same decision and events must have a stable trace ID");
  assert.match(traceA.traceId, /^sct_[a-f0-9]{8}$/, "trace ID must use the bounded deterministic format");
  assert.equal(JSON.stringify(result), resultBefore, "trace construction must not mutate the engine result");

  assert.deepEqual(traceA.candidateSet.beforeFiltering, result.trace.candidates.map((entry) => entry.candidateId).sort());
  assert.deepEqual(traceA.candidateSet.afterFiltering, result.trace.candidates.filter((entry) => entry.eligible).map((entry) => entry.candidateId).sort());
  assert.equal(traceA.selection.topCandidateId, result.top.candidateId);
  assert.equal(traceA.decisionEvent.eventId, events[3].eventId);
  assert.equal(traceA.decisionEvent.occurredAtMs, events[3].occurredAtMs);
  assert(traceA.graph.edges.some((edge) => edge.evidence === "observed-transition" && edge.eventId === events[3].eventId));
  assert(traceA.graph.nodes.some((node) => node.id === "S7" && node.labelCode.includes("future")));
  assert.equal(traceA.causalityBoundary.claimLevel, "mechanism-only");
  assert.equal(traceA.causalityBoundary.randomizedOrControlledExperimentRequiredForEffectClaim, true);

  const selected = domain.explainSelection(traceA);
  assert.equal(selected.candidateId, result.top.candidateId);
  assert.equal(selected.role, "top");
  assert(selected.positiveContributions.length > 0);
  assert(selected.positiveContributions.every((entry) => entry.contribution > 0));

  const rejected = traceA.candidates.find((candidate) => !candidate.eligible);
  assert(rejected, "fixture must contain an excluded candidate");
  const exclusion = domain.explainExclusion(traceA, rejected.candidateId);
  assert.equal(exclusion.found, true);
  assert.equal(exclusion.eligible, false);
  assert(exclusion.reasonCodes.length > 0);
  assert.deepEqual(domain.explainExclusion(traceA, "missing-candidate").reasonCodes, ["exclusion.candidate-not-in-trace"]);

  assert(traceA.bumps.length > 0, "catalog bump evaluations must be present");
  for (const bump of traceA.bumps) {
    assert.equal(bump.selected, result.bump?.bumpId === bump.bumpId);
    if (!bump.eligible) assert(bump.excludedBy.length > 0);
  }

  const oldTrace = { ...traceA, schemaVersion: "robys.smart-choice-decision-trace.v0" };
  const oldRead = domain.readDecisionTrace(oldTrace);
  assert.equal(oldRead.ok, false);
  assert.equal(oldRead.code, "unsupported-version");
  assert.equal(oldRead.foundVersion, "robys.smart-choice-decision-trace.v0");
  assert.match(oldRead.diagnostics[0].message, /supported version/i);

  const changedEvents = events.map((event, index) => index === 3 ? { ...event, occurredAtMs: event.occurredAtMs + 1 } : event);
  const traceChanged = domain.buildDecisionTrace(result, changedEvents);
  assert.notEqual(traceA.traceId, traceChanged.traceId, "changing linked evidence must change the trace ID");

  const text = domain.renderDecisionTraceText(traceA);
  assert.match(text, /mechanism trace only/i);
  assert.match(text, new RegExp(result.top.candidateId));
  assert.match(text, /Excluded/);

  const domainSource = await readFile("src/smart-choice/decision-trace-domain.ts", "utf8");
  const runtimeSource = await readFile("src/smart-choice/decision-trace.ts", "utf8");
  const html = await readFile("smart-choice/index.html", "utf8");
  const buildSource = await readFile("scripts/build.mjs", "utf8");
  assert(!domainSource.includes("document."), "domain trace must not contain DOM state");
  assert(!domainSource.includes("sessionStorage"), "domain trace must not read browser storage");
  assert(!runtimeSource.includes("innerHTML"));
  assert(!runtimeSource.includes("fetch("));
  assert(runtimeSource.includes("traceDebug"));
  assert(runtimeSource.includes("RobysSmartChoiceDecisionTrace"));
  assert(html.includes('src="decision-trace-v2.js'));
  assert(html.includes('href="decision-trace.css'));
  assert(buildSource.includes('entryPoints: ["src/smart-choice/decision-trace.ts"]'));
  assert(buildSource.includes('revisionFor("smart-choice/decision-trace-v2.js")'));

  console.log("✅ SMART-CHOICE-DECISION-TRACE passed: stable JSON, engine independence, candidate and bump explanations, event linkage, causal graph, debug renderer and fail-closed versions verified.");
} finally {
  await rm(temp, { recursive: true, force: true });
}
