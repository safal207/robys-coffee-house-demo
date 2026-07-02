import { readFileSync } from "node:fs";
import { probeReviewerRoster } from "./probe-reviewer-roster.mjs";

const roster = JSON.parse(readFileSync("qa/reviewer-roster.json", "utf8"));
const ready = probeReviewerRoster(roster, "L3", {
  coderabbit: "AVAILABLE",
  codex: "AVAILABLE"
});
if (ready.decision !== "READY") {
  throw new Error(`expected READY, got ${ready.decision}`);
}

const weakened = structuredClone(roster);
const codex = weakened.reviewers.find((reviewer) => reviewer.id === "codex");
codex.eligibleDepths = codex.eligibleDepths.filter((depth) => depth !== "L2");

try {
  probeReviewerRoster(weakened, "L2", {});
  throw new Error("configured capacity weakening should fail");
} catch (error) {
  if (!error.message.includes("L2 has only 1 eligible binding reviewers for minimum 2")) {
    throw error;
  }
}

console.log("✅ RRM-ROSTER-001 module import and configured-capacity validation passed.");
