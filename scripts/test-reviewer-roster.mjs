import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(ROOT, "probe-reviewer-roster.mjs");
const BASE = JSON.parse(readFileSync(path.join(ROOT, "../qa/reviewer-roster.json"), "utf8"));

function run(depth, statuses = {}, mutator) {
  const directory = mkdtempSync(path.join(tmpdir(), "rrm-roster-"));
  try {
    const roster = structuredClone(BASE);
    mutator?.(roster);
    const rosterPath = path.join(directory, "roster.json");
    writeFileSync(rosterPath, JSON.stringify(roster, null, 2));
    return spawnSync(process.execPath, [
      SCRIPT,
      "--roster", rosterPath,
      "--depth", depth,
      "--statuses-json", JSON.stringify(statuses)
    ], { encoding: "utf8" });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function expectDecision(label, expected, depth, statuses, assertion) {
  const result = run(depth, statuses);
  if (result.status !== 0) throw new Error(`${label} should pass:\n${result.stderr || result.stdout}`);
  const payload = JSON.parse(result.stdout);
  if (payload.decision !== expected) throw new Error(`${label}: expected ${expected}, got ${payload.decision}`);
  assertion?.(payload);
}

function expectFailure(label, expectedText, depth, statuses = {}, mutator) {
  const result = run(depth, statuses, mutator);
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.status === 0 || !output.includes(expectedText)) {
    throw new Error(`${label} should fail with ${expectedText}:\n${output}`);
  }
}

expectDecision("human maintainer is sufficient", "READY", "L3", {
  "human-maintainer": "AVAILABLE"
}, (payload) => {
  if (payload.availableBindingReviewers.join(",") !== "human-maintainer") {
    throw new Error(`unexpected binding reviewer: ${payload.availableBindingReviewers.join(",")}`);
  }
  if (!payload.optionalAdvisoryReviewers.includes("codex")) throw new Error("Codex is not advisory");
});

expectDecision("available Codex remains advisory", "READY", "L3", {
  "human-maintainer": "AVAILABLE",
  codex: "AVAILABLE"
}, (payload) => {
  if (payload.availableBindingReviewers.includes("codex")) throw new Error("Codex counted as binding");
  if (!payload.availableAdvisoryReviewers.includes("codex")) throw new Error("Codex advisory availability missing");
});

for (const status of ["PARTIAL", "PAUSED", "QUOTA_EXHAUSTED", "NO_BALANCE", "NOT_CONFIGURED", "TIMED_OUT", "UNKNOWN"]) {
  expectDecision(`human maintainer ${status} escalates`, "ESCALATE", "L3", {
    "human-maintainer": status,
    codex: "AVAILABLE"
  }, (payload) => {
    if (!payload.reasons.includes("BINDING_CAPACITY_0_OF_1")) throw new Error("binding capacity escalation missing");
    if (!payload.reasons.includes("HUMAN_REVIEWER_REQUIRED")) throw new Error("human escalation reason missing");
    if (payload.availableBindingReviewers.includes("codex")) throw new Error("advisory reviewer filled binding capacity");
  });
}

expectDecision("partial human reviewer is reported", "ESCALATE", "L2", {
  "human-maintainer": "PARTIAL"
}, (payload) => {
  if (!payload.partialReviewers.includes("human-maintainer")) throw new Error("partial human reviewer was not reported");
  if (!payload.runtimeWarnings.includes("PARTIAL_BINDING_REVIEWER_human-maintainer")) throw new Error("partial binding warning missing");
});

expectFailure("invalid runtime status", "invalid runtime status", "L2", { "human-maintainer": "INVALID" });
expectFailure("unknown reviewer status", "unknown reviewer", "L2", { unregistered: "AVAILABLE" });

for (const reviewerId of ["codex", "deepseek"]) {
  expectFailure(`${reviewerId} advisory authority mutation`, `${reviewerId} must remain advisory-only`, "L3", {}, (roster) => {
    const reviewer = roster.reviewers.find((item) => item.id === reviewerId);
    reviewer.binding = true;
    reviewer.advisory = false;
  });
}

expectFailure("undeclared advisory reviewer", "advisory authority must be declared non-negotiable", "L3", {}, (roster) => {
  roster.nonNegotiablePolicy.advisoryReviewers = ["codex"];
});

expectFailure("binding floor mutation", "L3 minimumAvailable must remain 1", "L3", {}, (roster) => {
  roster.bindingRequirements.L3.minimumAvailable = 2;
});

expectFailure("human eligibility removal", "L4 has only 0 eligible binding reviewers for minimum 1", "L4", {}, (roster) => {
  const human = roster.reviewers.find((item) => item.id === "human-maintainer");
  human.eligibleDepths = human.eligibleDepths.filter((depth) => depth !== "L4");
});

console.log("✅ RRM-ROSTER-001 mutation tests passed: the human maintainer is the sole binding reviewer and optional AI reviewers remain advisory at every depth.");
