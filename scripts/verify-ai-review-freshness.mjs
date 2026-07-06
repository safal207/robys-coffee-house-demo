import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/ai-review-contract.yml", "utf8");
const verifier = readFileSync("scripts/verify-ai-review-contract.cjs", "utf8");
const contract = `${workflow}\n${verifier}`;
const requiredTokens = [
  "verify-ai-review-contract.cjs",
  "currentHead",
  "commit_id",
  "codeRabbitRequestAt",
  "codexRequestAt"
];

const forbiddenTokens = [
  "latestDeepSeekRequestAt",
  "/deepseek review",
  "hasDeepSeekEvidence"
];

const missing = requiredTokens.filter((token) => !contract.includes(token));
if (missing.length > 0) {
  throw new Error(`[AI-FRESHNESS-001] missing exact-head/latest-request guard(s): ${missing.join(", ")}`);
}

const forbidden = forbiddenTokens.filter((token) => contract.includes(token));
if (forbidden.length > 0) {
  throw new Error(`[AI-FRESHNESS-001] optional reviewer leaked into binding gate: ${forbidden.join(", ")}`);
}

console.log("✅ AI-FRESHNESS-001 valid: the workflow delegates to a current-head verifier; CodeRabbit and Codex require latest-request exact-head evidence, while optional reviewers cannot block readiness.");
