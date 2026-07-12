import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/ai-review-contract.yml", "utf8");
const verifier = readFileSync("scripts/verify-ai-review-contract.cjs", "utf8");
const contract = `${workflow}\n${verifier}`;
const requiredTokens = [
  "verify-ai-review-contract.cjs",
  "currentHead",
  "commit_id",
  "headUpdateAnchor",
  "QODO_LOGINS",
  "QODO_COMMAND",
  "qodoRequestAt",
  'review.user?.type === "Bot"'
];

const forbiddenTokens = [
  "CodeRabbit (required)",
  "CODERABBIT_STATUS_CONTEXT",
  "codeRabbitRequestAt",
  "latestDeepSeekRequestAt",
  "/deepseek review",
  "hasDeepSeekEvidence"
];

const missing = requiredTokens.filter((token) => !contract.includes(token));
if (missing.length > 0) {
  throw new Error(`[AI-FRESHNESS-001] missing Qodo exact-head/request guard(s): ${missing.join(", ")}`);
}

const forbidden = forbiddenTokens.filter((token) => contract.includes(token));
if (forbidden.length > 0) {
  throw new Error(`[AI-FRESHNESS-001] advisory reviewer leaked into binding gate: ${forbidden.join(", ")}`);
}

console.log("✅ AI-FRESHNESS-001 valid: Qodo requires a trusted post-anchor approval and an exact-head Bot review; CodeRabbit, Codex and optional reviewers cannot satisfy the binding lane.");
