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

expectDecision("two binding reviewers", "READY", "L3", {
  coderabbit: "AVAILABLE",
  codex: "AVAILABLE"
});
expectDecision("partial reviewer is not available", "ESCALATE", "L2", {
  coderabbit: "PARTIAL",
  codex: "AVAILABLE"
}, (payload) => {
  if (payload.availableBindingReviewers.includes("coderabbit")) throw new Error("partial reviewer counted as available");
  if (!payload.partialReviewers.includes("coderabbit")) throw new Error("partial reviewer was not reported");
  if (!payload.runtimeWarnings.includes("PARTIAL_REVIEWER_coderabbit")) throw new Error("partial warning missing");
});
expectDecision("advisory cannot fill binding capacity", "ESCALATE", "L3", {
  coderabbit: "AVAILABLE",
  deepseek: "AVAILABLE"
}, (payload) => {
  if (payload.availableBindingReviewers.includes("deepseek")) throw new Error("DeepSeek counted as binding");
  if (!payload.availableAdvisoryReviewers.includes("deepseek")) throw new Error("DeepSeek advisory availability missing");
});
expectDecision("L4 requires a human", "ESCALATE", "L4", {
  coderabbit: "AVAILABLE",
  codex: "AVAILABLE"
}, (payload) => {
  if (!payload.reasons.includes("HUMAN_REVIEWER_REQUIRED")) throw new Error("missing human escalation reason");
});
expectDecision("human capacity is explicit", "READY", "L4", {
  coderabbit: "AVAILABLE",
  "human-maintainer": "AVAILABLE"
});
expectDecision("unknown runtime state escalates", "ESCALATE", "L2", {});
expectFailure("invalid runtime status", "invalid runtime status", "L2", { codex: "INVALID" });
expectFailure("unknown reviewer status", "unknown reviewer", "L2", { unregistered: "AVAILABLE" });
expectFailure("advisory authority mutation", "deepseek must remain advisory-only", "L3", {}, (roster) => {
  const deepseek = roster.reviewers.find((reviewer) => reviewer.id === "deepseek");
  deepseek.binding = true;
  deepseek.advisory = false;
});
expectFailure("binding floor mutation", "L3 minimumAvailable must remain 2", "L3", {}, (roster) => {
  roster.bindingRequirements.L3.minimumAvailable = 1;
});

console.log("✅ RRM-ROSTER-001 mutation tests passed: partial state, capacity, human authorization and advisory isolation.");
