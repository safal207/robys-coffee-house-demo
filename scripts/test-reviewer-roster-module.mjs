import { readFileSync } from "node:fs";
import { probeReviewerRoster } from "./probe-reviewer-roster.mjs";

const roster = JSON.parse(readFileSync("qa/reviewer-roster.json", "utf8"));
const ready = probeReviewerRoster(roster, "L3", {
  coderabbit: "AVAILABLE",
  "human-maintainer": "AVAILABLE",
  codex: "NO_BALANCE"
});
if (ready.decision !== "READY") {
  throw new Error(`expected READY, got ${ready.decision}`);
}
if (!ready.runtimeWarnings.includes("ADVISORY_REVIEWER_codex_NO_BALANCE")) {
  throw new Error("Codex NO_BALANCE advisory warning is missing");
}
if (ready.availableBindingReviewers.includes("codex")) {
  throw new Error("Codex must not count toward binding readiness");
}

const weakened = structuredClone(roster);
const human = weakened.reviewers.find((reviewer) => reviewer.id === "human-maintainer");
human.eligibleDepths = human.eligibleDepths.filter((depth) => depth !== "L2");

try {
  probeReviewerRoster(weakened, "L2", {});
  throw new Error("configured capacity weakening should fail");
} catch (error) {
  if (!error.message.includes("L2 has only 1 eligible binding reviewers for minimum 2")) {
    throw error;
  }
}

console.log("✅ RRM-ROSTER-001 module validation passed: Codex balance is advisory-only and binding capacity cannot be weakened.");
