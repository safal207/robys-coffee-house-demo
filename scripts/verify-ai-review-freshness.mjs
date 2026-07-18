import { readFileSync } from "node:fs";

const TRUSTED_VERIFIER_REF = "686e2ed6bb17a69679684ba9398cb641beb8fefa";
const workflow = readFileSync(".github/workflows/ai-review-contract.yml", "utf8");
const verifier = readFileSync("scripts/verify-ai-review-contract.cjs", "utf8");
const contract = `${workflow}\n${verifier}`;
const requiredTokens = [
  "verify-ai-review-contract.cjs",
  `ref: ${TRUSTED_VERIFIER_REF}`,
  "currentHead",
  "commit_id",
  "QODO_COMMAND",
  "CODEX_COMMAND",
  "qodoRequestAt",
  "warmStandbyRoundReady",
  "DORMANT_PROVIDER_NAMES"
];

const forbiddenTokens = [
  "ref: 577dfd5eebe75038ee067830e6b0c70815fcc837",
  "codeRabbitRequestAt",
  "codexRequestAt",
  "latestDeepSeekRequestAt",
  "/deepseek review",
  "hasDeepSeekEvidence"
];

const missing = requiredTokens.filter((token) => !contract.includes(token));
if (missing.length > 0) {
  throw new Error(`[AI-FRESHNESS-001] missing trusted active-pool exact-head guard(s): ${missing.join(", ")}`);
}

const forbidden = forbiddenTokens.filter((token) => contract.includes(token));
if (forbidden.length > 0) {
  throw new Error(`[AI-FRESHNESS-001] stale verifier or optional reviewer leaked into binding gate: ${forbidden.join(", ")}`);
}

console.log(`✅ AI-FRESHNESS-001 valid: Actions pins trusted verifier ${TRUSTED_VERIFIER_REF}; Qodo and Codex form the active request-bound pool, while dormant or optional reviewers cannot block readiness.`);
