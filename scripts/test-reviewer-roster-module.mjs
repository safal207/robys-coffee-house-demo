import { readFileSync } from "node:fs";
import { probeReviewerRoster } from "./probe-reviewer-roster.mjs";

const roster = JSON.parse(readFileSync("qa/reviewer-roster.json", "utf8"));

const ready = probeReviewerRoster(roster, "L3", {
  coderabbit: "AVAILABLE",
  "human-maintainer": "AVAILABLE",
  codex: "UNKNOWN"
});
if (ready.decision !== "READY") throw new Error(`expected READY, got ${ready.decision}`);
if (!ready.availableBindingReviewers.includes("coderabbit")) {
  throw new Error("CodeRabbit binding reviewer is missing");
}
if (ready.availableBindingReviewers.includes("codex")) {
  throw new Error("Codex counted as binding");
}
if (!ready.runtimeWarnings.includes("ADVISORY_REVIEWER_codex_UNKNOWN")) {
  throw new Error("Codex advisory warning is missing");
}

const waived = probeReviewerRoster(roster, "L3", {
  coderabbit: "QUOTA_EXHAUSTED",
  "human-maintainer": "AVAILABLE"
});
if (waived.decision !== "READY") throw new Error(`expected quota-waived READY, got ${waived.decision}`);
if (!waived.waivedBindingReviewers.includes("coderabbit")) {
  throw new Error("CodeRabbit quota waiver is missing");
}
const waivedRabbit = waived.reviewers.find((reviewer) => reviewer.id === "coderabbit");
if (waivedRabbit.runtimeStatus !== "QUOTA_EXHAUSTED" || waivedRabbit.status !== "AVAILABLE") {
  throw new Error("quota waiver must preserve runtimeStatus while exposing effective route availability");
}

const notWaived = probeReviewerRoster(roster, "L3", {
  coderabbit: "NO_BALANCE",
  "human-maintainer": "AVAILABLE"
});
if (notWaived.decision !== "ESCALATE") throw new Error("NO_BALANCE must not activate quota waiver");
const unavailableRabbit = notWaived.reviewers.find((reviewer) => reviewer.id === "coderabbit");
if (unavailableRabbit.status !== "NO_BALANCE" || unavailableRabbit.runtimeStatus !== "NO_BALANCE") {
  throw new Error("non-waived provider status must remain unavailable to route selection");
}

const weakened = structuredClone(roster);
const human = weakened.reviewers.find((reviewer) => reviewer.id === "human-maintainer");
human.eligibleDepths = human.eligibleDepths.filter((depth) => depth !== "L2");
try {
  probeReviewerRoster(weakened, "L2", {});
  throw new Error("configured capacity weakening should fail");
} catch (error) {
  if (!error.message.includes("L2 has only 1 eligible binding reviewers for minimum 2")) throw error;
}

console.log("✅ RRM roster module passed: CodeRabbit is binding, QUOTA_EXHAUSTED preserves the real runtime state while exposing narrow route availability, Codex is advisory, and human capacity remains protected.");
