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

const bindingReady = {
  codex: "AVAILABLE",
  "human-maintainer": "AVAILABLE"
};

expectDecision("Codex and human binding pair is sufficient", "READY", "L3", bindingReady, (payload) => {
  if (payload.availableBindingReviewers.join(",") !== "codex,human-maintainer") {
    throw new Error(`unexpected binding pair: ${payload.availableBindingReviewers.join(",")}`);
  }
  if (!payload.optionalAdvisoryReviewers.includes("coderabbit")) throw new Error("CodeRabbit is not optional advisory");
});

expectDecision("available CodeRabbit is advisory only", "READY", "L3", {
  ...bindingReady,
  coderabbit: "AVAILABLE"
}, (payload) => {
  if (payload.availableBindingReviewers.includes("coderabbit")) throw new Error("CodeRabbit counted as binding");
  if (!payload.availableAdvisoryReviewers.includes("coderabbit")) throw new Error("CodeRabbit advisory availability missing");
});

for (const status of ["PARTIAL", "PAUSED", "NO_BALANCE", "QUOTA_EXHAUSTED", "NOT_CONFIGURED", "TIMED_OUT", "UNKNOWN"]) {
  expectDecision(`CodeRabbit ${status} is non-blocking`, "READY", "L3", {
    ...bindingReady,
    coderabbit: status
  }, (payload) => {
    if (!payload.runtimeWarnings.includes(`ADVISORY_REVIEWER_coderabbit_${status}`)) {
      throw new Error(`missing CodeRabbit ${status} warning`);
    }
    const unavailable = payload.unavailableAdvisoryReviewers.find((reviewer) => reviewer.id === "coderabbit");
    if (unavailable?.status !== status) throw new Error(`missing CodeRabbit unavailable state ${status}`);
    if (payload.reasons.some((reason) => reason.includes("coderabbit"))) throw new Error("CodeRabbit advisory state became a blocking reason");
  });
}

expectDecision("partial Codex escalates", "ESCALATE", "L2", {
  codex: "PARTIAL",
  "human-maintainer": "AVAILABLE",
  coderabbit: "AVAILABLE"
}, (payload) => {
  if (payload.availableBindingReviewers.includes("codex")) throw new Error("partial Codex counted as available");
  if (!payload.partialReviewers.includes("codex")) throw new Error("partial Codex was not reported");
  if (!payload.runtimeWarnings.includes("PARTIAL_BINDING_REVIEWER_codex")) throw new Error("partial binding warning missing");
});

expectDecision("advisory cannot fill binding capacity", "ESCALATE", "L3", {
  codex: "AVAILABLE",
  coderabbit: "AVAILABLE",
  deepseek: "AVAILABLE"
}, (payload) => {
  if (!payload.availableBindingReviewers.includes("codex")) throw new Error("Codex binding reviewer missing");
  if (payload.availableBindingReviewers.includes("coderabbit")) throw new Error("CodeRabbit counted as binding");
  if (payload.availableBindingReviewers.includes("deepseek")) throw new Error("DeepSeek counted as binding");
  if (!payload.reasons.includes("BINDING_CAPACITY_1_OF_2")) throw new Error("missing binding capacity reason");
  if (!payload.reasons.includes("HUMAN_REVIEWER_REQUIRED")) throw new Error("missing human escalation reason");
});

expectDecision("L4 requires a human", "ESCALATE", "L4", {
  codex: "AVAILABLE",
  coderabbit: "AVAILABLE"
}, (payload) => {
  if (!payload.reasons.includes("BINDING_CAPACITY_1_OF_2")) throw new Error("missing binding capacity reason");
  if (!payload.reasons.includes("HUMAN_REVIEWER_REQUIRED")) throw new Error("missing human escalation reason");
});

expectDecision("human capacity is explicit", "READY", "L4", {
  codex: "AVAILABLE",
  "human-maintainer": "AVAILABLE",
  coderabbit: "NO_BALANCE"
});

expectDecision("unknown binding runtime state escalates", "ESCALATE", "L2", {
  codex: "UNKNOWN",
  "human-maintainer": "AVAILABLE"
});
expectFailure("invalid runtime status", "invalid runtime status", "L2", { codex: "INVALID" });
expectFailure("unknown reviewer status", "unknown reviewer", "L2", { unregistered: "AVAILABLE" });

for (const reviewerId of ["coderabbit", "deepseek"]) {
  expectFailure(`${reviewerId} advisory authority mutation`, `${reviewerId} must remain advisory-only`, "L3", {}, (roster) => {
    const reviewer = roster.reviewers.find((item) => item.id === reviewerId);
    reviewer.binding = true;
    reviewer.advisory = false;
  });
}

expectFailure("undeclared advisory reviewer", "advisory authority must be declared non-negotiable", "L3", {}, (roster) => {
  roster.nonNegotiablePolicy.advisoryReviewers = ["coderabbit"];
});

expectFailure("binding floor mutation", "L3 minimumAvailable must remain 2", "L3", {}, (roster) => {
  roster.bindingRequirements.L3.minimumAvailable = 1;
});

console.log("✅ RRM-ROSTER-001 mutation tests passed: Codex is binding, CodeRabbit remains advisory reserve, binding capacity stays explicit, and human authorization remains required.");
