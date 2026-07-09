#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DECISIONS = new Set(["allow", "reject", "hold", "escalate"]);
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
];

const SCORE_DIMENSIONS = [
  "project_invariant_alignment",
  "side_effect_safety",
  "evidence_path",
  "exact_head_confidence",
  "reversibility",
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function pushError(errors, message) {
  errors.push(message);
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

function validateScorecard(record, errors, warnings) {
  if (!record.scorecard) {
    warnings.push("No scorecard provided. Structural validation only.");
    return null;
  }

  const scorecard = record.scorecard;
  const scores = scorecard.scores ?? {};
  let computedTotal = 0;

  for (const dimension of SCORE_DIMENSIONS) {
    const value = scores[dimension]?.value;
    if (!Number.isInteger(value) || value < 0 || value > 2) {
      pushError(errors, `Invalid scorecard.scores.${dimension}.value: expected integer 0..2.`);
      continue;
    }
    computedTotal += value;
  }

  if (typeof scorecard.total === "number" && scorecard.total !== computedTotal) {
    pushError(errors, `Scorecard total mismatch: declared ${scorecard.total}, computed ${computedTotal}.`);
  }

  const hardBlockers = asArray(scorecard.hard_blockers).filter(Boolean);
  const decision = record.orientation_center?.decision;

  if (hardBlockers.length > 0 && decision === "allow") {
    pushError(errors, "Hard blockers are present, but decision is allow.");
  }

  if (computedTotal >= 8 && hardBlockers.length === 0 && !["allow", "escalate"].includes(decision)) {
    warnings.push(`Score is ${computedTotal} with no hard blockers; expected allow unless escalation is required.`);
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

function validateEvidenceShape(record, errors, warnings) {
  const evidenceBefore = record.real_graph?.evidence_before;
  if (!evidenceBefore) {
    warnings.push("Missing real_graph.evidence_before; evidence state is less auditable.");
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
  validateEvidenceShape(record, errors, warnings);
  const scoreSummary = validateScorecard(record, errors, warnings);

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
