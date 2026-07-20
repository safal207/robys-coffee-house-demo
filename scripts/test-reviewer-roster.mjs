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
  coderabbit: "AVAILABLE",
  "human-maintainer": "AVAILABLE"
};

expectDecision("CodeRabbit and human binding pair is sufficient", "READY", "L3", bindingReady, (payload) => {
  if (payload.availableBindingReviewers.join(",") !== "coderabbit,human-maintainer") {
    throw new Error(`unexpected binding pair: ${payload.availableBindingReviewers.join(",")}`);
  }
  if (!payload.optionalAdvisoryReviewers.includes("codex")) throw new Error("Codex is not advisory");
});

expectDecision("available Codex remains advisory", "READY", "L3", {
  ...bindingReady,
  codex: "AVAILABLE"
}, (payload) => {
  if (payload.availableBindingReviewers.includes("codex")) throw new Error("Codex counted as binding");
  if (!payload.availableAdvisoryReviewers.includes("codex")) throw new Error("Codex advisory availability missing");
});

expectDecision("CodeRabbit quota exhaustion is explicitly waived", "READY", "L3", {
  coderabbit: "QUOTA_EXHAUSTED",
  "human-maintainer": "AVAILABLE"
}, (payload) => {
  if (!payload.availableBindingReviewers.includes("coderabbit")) throw new Error("waived CodeRabbit missing from effective binding capacity");
  if (!payload.waivedBindingReviewers.includes("coderabbit")) throw new Error("CodeRabbit waiver not reported");
  if (!payload.runtimeWarnings.includes("BINDING_REVIEWER_coderabbit_QUOTA_EXHAUSTED_WAIVED")) {
    throw new Error("quota waiver warning missing");
  }
});

for (const status of ["PARTIAL", "PAUSED", "NO_BALANCE", "NOT_CONFIGURED", "TIMED_OUT", "UNKNOWN"]) {
  expectDecision(`CodeRabbit ${status} does not activate waiver`, "ESCALATE", "L3", {
    coderabbit: status,
    "human-maintainer": "AVAILABLE",
    codex: "AVAILABLE"
  }, (payload) => {
    if (payload.waivedBindingReviewers.includes("coderabbit")) throw new Error(`${status} incorrectly activated waiver`);
    if (!payload.reasons.includes("BINDING_CAPACITY_1_OF_2")) throw new Error("binding capacity escalation missing");
  });
}

expectDecision("partial CodeRabbit is reported", "ESCALATE", "L2", {
  coderabbit: "PARTIAL",
  "human-maintainer": "AVAILABLE"
}, (payload) => {
  if (!payload.partialReviewers.includes("coderabbit")) throw new Error("partial CodeRabbit was not reported");
  if (!payload.runtimeWarnings.includes("PARTIAL_BINDING_REVIEWER_coderabbit")) throw new Error("partial binding warning missing");
});

expectDecision("advisory reviewers cannot fill binding capacity", "ESCALATE", "L3", {
  coderabbit: "UNKNOWN",
  codex: "AVAILABLE",
  deepseek: "AVAILABLE",
  "human-maintainer": "AVAILABLE"
}, (payload) => {
  if (payload.availableBindingReviewers.includes("codex")) throw new Error("Codex counted as binding");
  if (payload.availableBindingReviewers.includes("deepseek")) throw new Error("DeepSeek counted as binding");
  if (!payload.reasons.includes("BINDING_CAPACITY_1_OF_2")) throw new Error("missing binding capacity reason");
});

expectDecision("L4 still requires a human", "ESCALATE", "L4", {
  coderabbit: "AVAILABLE"
}, (payload) => {
  if (!payload.reasons.includes("BINDING_CAPACITY_1_OF_2")) throw new Error("missing binding capacity reason");
  if (!payload.reasons.includes("HUMAN_REVIEWER_REQUIRED")) throw new Error("missing human escalation reason");
});

expectDecision("human capacity remains explicit under quota waiver", "READY", "L4", {
  coderabbit: "QUOTA_EXHAUSTED",
  "human-maintainer": "AVAILABLE"
});

expectFailure("invalid runtime status", "invalid runtime status", "L2", { coderabbit: "INVALID" });
expectFailure("unknown reviewer status", "unknown reviewer", "L2", { unregistered: "AVAILABLE" });

for (const reviewerId of ["codex", "deepseek"]) {
  expectFailure(`${reviewerId} advisory authority mutation`, `${reviewerId} must remain advisory-only`, "L3", {}, (roster) => {
    const reviewer = roster.reviewers.find((item) => item.id === reviewerId);
    reviewer.binding = true;
    reviewer.advisory = false;
  });
}

expectFailure("CodeRabbit binding mutation", "coderabbit provider-limit waiver requires a binding AI reviewer", "L3", {}, (roster) => {
  const reviewer = roster.reviewers.find((item) => item.id === "coderabbit");
  reviewer.binding = false;
  reviewer.advisory = true;
  roster.nonNegotiablePolicy.advisoryReviewers.push("coderabbit");
});

expectFailure("waiver status broadening", "statuses must remain QUOTA_EXHAUSTED only", "L3", {}, (roster) => {
  roster.nonNegotiablePolicy.providerLimitWaivers.statuses.push("NO_BALANCE");
});

expectFailure("human waiver forbidden", "human reviewer cannot be provider-limit waived", "L3", {}, (roster) => {
  roster.nonNegotiablePolicy.providerLimitWaivers.reviewers.push("human-maintainer");
});

expectFailure("undeclared advisory reviewer", "advisory authority must be declared non-negotiable", "L3", {}, (roster) => {
  roster.nonNegotiablePolicy.advisoryReviewers = ["codex"];
});

expectFailure("binding floor mutation", "L3 minimumAvailable must remain 2", "L3", {}, (roster) => {
  roster.bindingRequirements.L3.minimumAvailable = 1;
});

console.log("✅ RRM-ROSTER-001 mutation tests passed: CodeRabbit is binding, explicit QUOTA_EXHAUSTED may be waived, Codex and DeepSeek remain advisory, and human authorization stays mandatory at L2-L4.");
