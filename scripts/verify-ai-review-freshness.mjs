import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/ai-review-contract.yml", "utf8");
const requiredTokens = [
  "currentHead",
  "commit_id",
  "latestCodexRequestAt",
  "latestCodeRabbitRequestAt"
];

const forbiddenTokens = [
  "latestDeepSeekRequestAt",
  "/deepseek review",
  "hasDeepSeekEvidence"
];

const missing = requiredTokens.filter((token) => !workflow.includes(token));
if (missing.length > 0) {
  throw new Error(`[AI-FRESHNESS-001] missing exact-head/latest-request guard(s): ${missing.join(", ")}`);
}

const forbidden = forbiddenTokens.filter((token) => workflow.includes(token));
if (forbidden.length > 0) {
  throw new Error(`[AI-FRESHNESS-001] optional reviewer leaked into binding gate: ${forbidden.join(", ")}`);
}

console.log("✅ AI-FRESHNESS-001 valid: Codex and CodeRabbit require latest-request exact-head evidence; optional reviewers cannot block readiness.");
