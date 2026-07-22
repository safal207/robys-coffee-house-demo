import { readFileSync } from "node:fs";
import { probeReviewerRoster } from "./probe-reviewer-roster.mjs";

const roster = JSON.parse(readFileSync("qa/reviewer-roster.json", "utf8"));

const ready = probeReviewerRoster(roster, "L3", {
  "human-maintainer": "AVAILABLE",
  codex: "UNKNOWN"
});
if (ready.decision !== "READY") throw new Error(`expected READY, got ${ready.decision}`);
if (!ready.availableBindingReviewers.includes("human-maintainer")) {
  throw new Error("human maintainer binding reviewer is missing");
}
if (ready.availableBindingReviewers.includes("codex")) {
  throw new Error("Codex counted as binding");
}
if (!ready.runtimeWarnings.includes("ADVISORY_REVIEWER_codex_UNKNOWN")) {
  throw new Error("Codex advisory warning is missing");
}

const unavailable = probeReviewerRoster(roster, "L3", {
  "human-maintainer": "UNKNOWN",
  codex: "AVAILABLE"
});
if (unavailable.decision !== "ESCALATE") throw new Error("missing human maintainer must escalate");
if (!unavailable.reasons.includes("BINDING_CAPACITY_0_OF_1")) {
  throw new Error("binding capacity escalation is missing");
}
if (!unavailable.reasons.includes("HUMAN_REVIEWER_REQUIRED")) {
  throw new Error("human requirement escalation is missing");
}
if (unavailable.availableBindingReviewers.includes("codex")) {
  throw new Error("advisory Codex filled binding capacity");
}

const weakened = structuredClone(roster);
const human = weakened.reviewers.find((reviewer) => reviewer.id === "human-maintainer");
human.eligibleDepths = human.eligibleDepths.filter((depth) => depth !== "L2");
try {
  probeReviewerRoster(weakened, "L2", {});
  throw new Error("configured capacity weakening should fail");
} catch (error) {
  if (!error.message.includes("L2 has only 0 eligible binding reviewers for minimum 1")) throw error;
}

console.log("✅ RRM roster module passed: human maintainer authority is binding, optional AI reviewers remain advisory, and unavailable human authority fails closed.");
