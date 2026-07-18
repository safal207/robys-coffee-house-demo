import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/ai-review-contract.yml", "utf8");
const verifier = readFileSync("scripts/verify-ai-review-contract.cjs", "utf8");
const contract = `${workflow}\n${verifier}`;
const requiredTokens = [
  "verify-ai-review-contract.cjs",
  "currentHead",
  "commit_id",
  "QODO_COMMAND",
  "CODEX_COMMAND",
  "qodoRequestAt",
  "warmStandbyRoundReady",
  "DORMANT_PROVIDER_NAMES"
];

const forbiddenTokens = [
  "codeRabbitRequestAt",
  "codexRequestAt",
  "latestDeepSeekRequestAt",
  "/deepseek review",
  "hasDeepSeekEvidence"
];

const missing = requiredTokens.filter((token) => !contract.includes(token));
if (missing.length > 0) {
  throw new Error(`[AI-FRESHNESS-001] missing current active-pool exact-head guard(s): ${missing.join(", ")}`);
}

const forbidden = forbiddenTokens.filter((token) => contract.includes(token));
if (forbidden.length > 0) {
  throw new Error(`[AI-FRESHNESS-001] stale or optional reviewer leaked into binding gate: ${forbidden.join(", ")}`);
}

console.log("✅ AI-FRESHNESS-001 valid: the workflow delegates to a current-head verifier; Qodo and Codex form the active request-bound pool, while dormant or optional reviewers cannot block readiness.");
