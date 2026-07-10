#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DECISIONS = new Set(["allow", "reject", "hold", "escalate"]);
const HOLD_BLOCKERS = new Set([
  "trusted_exact_head_evidence_required_but_missing",
  "bot_identity_untrusted_or_unknown",
  "baseline_refresh_lacks_source_artifact_or_run_id",
]);
const REJECT_BLOCKERS = new Set([
  "seal_order_wrong",
  "merge_readiness_command_premature",
  "transition_mutates_unrelated_repair_flows",
  "transition_hides_evidence_debt",
]);
const HARD_BLOCKERS = new Set([...HOLD_BLOCKERS, ...REJECT_BLOCKERS]);
const REQUIRED_TOP_LEVEL_FIELDS = [
  "id",
  "time_utc",
  "repo",
  "pr",
  "head_sha",
  "project_graph",
  "transition_graph",
  "real_graph",
  "orientation_center",
  "observer_graph",
  "tuner_graph",
  "scorecard",
];
const SCORE_DIMENSIONS = [
  "project_invariant_alignment",
  "side_effect_safety",
  "evidence_path",
  "exact_head_confidence",
  "reversibility",
];

/** Add one deterministic validation error. */
function pushError(errors, message) {
  errors.push(message);
}

/** Return an array or report a structural type error. */
function asArray(value, errors, fieldName) {
  if (value === undefined) {
    pushError(errors, `${fieldName} is required.`);
    return [];
  }
  if (!Array.isArray(value)) {
    pushError(errors, `${fieldName} must be an array when present.`);
    return [];
  }
  return value;
}

/** Validate the required top-level canonical record fields. */
function validateRequiredFields(record, errors) {
  for (const field of REQUIRED_TOP_LEVEL_FIELDS) {
    if (!(field in record)) pushError(errors, `Missing required top-level field: ${field}`);
  }
}

/** Validate the Orientation Center decision enum. */
function validateDecision(record, errors) {
  const decision = record.orientation_center?.decision;
  if (!DECISIONS.has(decision)) {
    pushError(
      errors,
      `Invalid orientation_center.decision: ${JSON.stringify(decision)}. Expected one of: ${[...DECISIONS].join(", ")}`,
    );
  }
}

/** Validate one evidence object without throwing on malformed input. */
function validateEvidenceObject(value, errors, fieldName, required = false) {
  if (value == null) {
    if (required) pushError(errors, `${fieldName} is required.`);
    return;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    pushError(errors, `${fieldName} must be an object when present.`);
    return;
  }
  for (const bucket of ["green", "red", "missing"]) {
    if (bucket in value && !Array.isArray(value[bucket])) {
      pushError(errors, `${fieldName}.${bucket} must be an array when present.`);
    }
  }
}

/** Validate before/after evidence containers. */
function validateEvidenceShape(record, errors) {
  validateEvidenceObject(record.real_graph?.evidence_before, errors, "real_graph.evidence_before", true);
  validateEvidenceObject(record.real_graph?.evidence_after, errors, "real_graph.evidence_after");
}

/** Infer objective blockers that must be explicitly declared. */
function expectedHardBlockers(record) {
  const missing = Array.isArray(record.real_graph?.evidence_before?.missing)
    ? record.real_graph.evidence_before.missing.join(" ").toLowerCase()
    : "";
  const expected = new Set();

  if (missing.includes("trusted") && (missing.includes("exact-head") || missing.includes("exact head"))) {
    expected.add("trusted_exact_head_evidence_required_but_missing");
  }
  if (missing.includes("bot identity") && (missing.includes("unknown") || missing.includes("untrusted"))) {
    expected.add("bot_identity_untrusted_or_unknown");
  }
  if (
    record.transition_graph?.candidate?.type === "baseline-refresh" &&
    (missing.includes("artifact") || missing.includes("run id") || missing.includes("workflow evidence"))
  ) {
    expected.add("baseline_refresh_lacks_source_artifact_or_run_id");
  }

  return expected;
}

/** Validate scores, blocker enum, omitted blockers, and blocker precedence. */
function validateScorecard(record, errors) {
  if (!record.scorecard || typeof record.scorecard !== "object" || Array.isArray(record.scorecard)) {
    pushError(errors, "scorecard must be an object.");
    return null;
  }

  const scorecard = record.scorecard;
  const scores = scorecard.scores;
  if (!scores || typeof scores !== "object" || Array.isArray(scores)) {
    pushError(errors, "scorecard.scores must be an object.");
    return null;
  }

  let computedTotal = 0;
  for (const dimension of SCORE_DIMENSIONS) {
    const value = scores[dimension]?.value;
    if (!Number.isInteger(value) || value < 0 || value > 2) {
      pushError(errors, `Invalid scorecard.scores.${dimension}.value: expected integer 0..2.`);
      continue;
    }
    computedTotal += value;
  }

  if (!Number.isInteger(scorecard.total) || scorecard.total !== computedTotal) {
    pushError(errors, `Scorecard total mismatch: declared ${JSON.stringify(scorecard.total)}, computed ${computedTotal}.`);
  }

  const hardBlockers = asArray(scorecard.hard_blockers, errors, "scorecard.hard_blockers");
  const knownBlockers = [];
  for (const blocker of hardBlockers) {
    if (typeof blocker !== "string" || !HARD_BLOCKERS.has(blocker)) {
      pushError(errors, `Unknown hard blocker: ${JSON.stringify(blocker)}.`);
    } else {
      knownBlockers.push(blocker);
    }
  }

  for (const expected of expectedHardBlockers(record)) {
    if (!knownBlockers.includes(expected)) pushError(errors, `Missing required hard blocker: ${expected}.`);
  }

  const decision = record.orientation_center?.decision;
  const hasRejectBlocker = knownBlockers.some((blocker) => REJECT_BLOCKERS.has(blocker));
  const hasHoldBlocker = knownBlockers.some((blocker) => HOLD_BLOCKERS.has(blocker));

  if (knownBlockers.length > 0 && decision === "allow") {
    pushError(errors, "Hard blockers are present, but decision is allow.");
  }
  if (knownBlockers.length > 0 && decision === "escalate") {
    pushError(errors, "Hard blockers are present, but decision is escalate; classify them as hold or reject first.");
  }
  if (hasRejectBlocker && decision !== "reject") {
    pushError(errors, "Reject-class hard blocker requires decision reject.");
  } else if (!hasRejectBlocker && hasHoldBlocker && decision !== "hold") {
    pushError(errors, "Hold-class hard blocker requires decision hold.");
  }

  if (knownBlockers.length === 0 && computedTotal >= 5 && computedTotal <= 7 && !["hold", "reject", "escalate"].includes(decision)) {
    pushError(errors, `Score is ${computedTotal}; expected hold/reject/escalate, got ${decision}.`);
  }
  if (knownBlockers.length === 0 && computedTotal <= 4 && !["reject", "hold", "escalate"].includes(decision)) {
    pushError(errors, `Score is ${computedTotal}; expected reject/hold/escalate, got ${decision}.`);
  }

  return { computed_total: computedTotal, hard_blockers: knownBlockers };
}

/** Validate one in-memory orientation record and return a structured result. */
export function validateRecord(record, source = "<memory>") {
  const errors = [];
  const warnings = [];

  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return { source, ok: false, errors: ["Record must be a JSON object."], warnings };
  }

  validateRequiredFields(record, errors);
  validateDecision(record, errors);
  validateEvidenceShape(record, errors);
  const scoreSummary = validateScorecard(record, errors);

  return {
    source,
    id: record.id,
    pr: record.pr,
    head_sha: record.head_sha,
    decision: record.orientation_center?.decision,
    score: scoreSummary?.computed_total ?? null,
    hard_blockers: scoreSummary?.hard_blockers ?? [],
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

/** Read and parse one JSON fixture. */
async function readJson(filePath) {
  const raw = await readFile(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse JSON in ${filePath}: ${error.message}`);
  }
}

/** Run the CLI validator for one or more JSON records. */
async function main() {
  const inputs = process.argv.slice(2);
  if (inputs.length === 0) {
    console.error("Usage: node scripts/validate-harmonic-orientation.mjs <orientation-record.json> [...more.json]");
    process.exit(2);
  }

  const results = [];
  let failed = false;
  for (const input of inputs) {
    const filePath = path.resolve(input);
    try {
      const result = validateRecord(await readJson(filePath), input);
      results.push(result);
      if (!result.ok) failed = true;
    } catch (error) {
      failed = true;
      results.push({ source: input, ok: false, errors: [error.message], warnings: [] });
    }
  }

  console.log(JSON.stringify({ results }, null, 2));
  if (failed) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
