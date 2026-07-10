#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DECISIONS = new Set(["allow", "reject", "hold", "escalate"]);
const HARD_BLOCKERS = new Set([
  "trusted_exact_head_evidence_required_but_missing",
  "bot_identity_untrusted_or_unknown",
  "seal_order_wrong",
  "merge_readiness_command_premature",
  "baseline_refresh_lacks_source_artifact_or_run_id",
  "transition_mutates_unrelated_repair_flows",
  "transition_hides_evidence_debt",
]);
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

function pushError(errors, message) {
  errors.push(message);
}

function asArray(value, errors, fieldName) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    pushError(errors, `${fieldName} must be an array when present.`);
    return [];
  }
  return value;
}

function validateRequiredFields(record, errors) {
  for (const field of REQUIRED_TOP_LEVEL_FIELDS) {
    if (!(field in record)) {
      pushError(errors, `Missing required top-level field: ${field}`);
    }
  }
}

function validateDecision(record, errors) {
  const decision = record.orientation_center?.decision;
  if (!DECISIONS.has(decision)) {
    pushError(
      errors,
      `Invalid orientation_center.decision: ${JSON.stringify(decision)}. Expected one of: ${[...DECISIONS].join(", ")}`,
    );
  }
}

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

  const hardBlockers = asArray(scorecard.hard_blockers, errors, "scorecard.hard_blockers").filter(Boolean);
  for (const blocker of hardBlockers) {
    if (typeof blocker !== "string" || !HARD_BLOCKERS.has(blocker)) {
      pushError(errors, `Unknown hard blocker: ${JSON.stringify(blocker)}.`);
    }
  }

  const decision = record.orientation_center?.decision;

  if (hardBlockers.length > 0 && decision === "allow") {
    pushError(errors, "Hard blockers are present, but decision is allow.");
  }

  if (computedTotal >= 5 && computedTotal <= 7 && !["hold", "reject", "escalate"].includes(decision)) {
    pushError(errors, `Score is ${computedTotal}; expected hold/reject/escalate, got ${decision}.`);
  }

  if (computedTotal <= 4 && !["reject", "hold", "escalate"].includes(decision)) {
    pushError(errors, `Score is ${computedTotal}; expected reject/hold/escalate, got ${decision}.`);
  }

  return {
    computed_total: computedTotal,
    hard_blockers: hardBlockers,
  };
}

function validateEvidenceShape(record, errors) {
  const evidenceBefore = record.real_graph?.evidence_before;
  if (evidenceBefore == null) {
    pushError(errors, "real_graph.evidence_before is required.");
    return;
  }

  if (typeof evidenceBefore !== "object" || Array.isArray(evidenceBefore)) {
    pushError(errors, "real_graph.evidence_before must be an object when present.");
    return;
  }

  for (const bucket of ["green", "red", "missing"]) {
    if (bucket in evidenceBefore && !Array.isArray(evidenceBefore[bucket])) {
      pushError(errors, `real_graph.evidence_before.${bucket} must be an array when present.`);
    }
  }
}

export function validateRecord(record, source = "<memory>") {
  const errors = [];
  const warnings = [];

  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return {
      source,
      ok: false,
      errors: ["Record must be a JSON object."],
      warnings,
    };
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

async function readJson(filePath) {
  const raw = await readFile(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse JSON in ${filePath}: ${error.message}`);
  }
}

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
      const record = await readJson(filePath);
      const result = validateRecord(record, input);
      results.push(result);
      if (!result.ok) {
        failed = true;
      }
    } catch (error) {
      failed = true;
      results.push({
        source: input,
        ok: false,
        errors: [error.message],
        warnings: [],
      });
    }
  }

  console.log(JSON.stringify({ results }, null, 2));

  if (failed) {
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
