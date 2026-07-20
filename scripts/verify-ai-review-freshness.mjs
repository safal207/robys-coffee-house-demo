import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/ai-review-contract.yml", "utf8");
const verifier = readFileSync("scripts/verify-ai-review-contract.cjs", "utf8");
const contract = `${workflow}\n${verifier}`;

const requiredTokens = [
  "verify-ai-review-contract.cjs",
  "github.event.pull_request.base.sha",
  "currentHead",
  "commit_id",
  "CODERABBIT_COMMAND",
  "latestCodeRabbitLimitSignal",
  "provider-limit-bypass",
  "DORMANT_PROVIDER_NAMES",
  "ADVISORY_PROVIDER_NAMES"
];

const forbiddenTokens = [
  "QODO_COMMAND",
  "/qodo review",
  "qodoRequestAt",
  "warmStandbyRoundReady",
  "Qodo remains primary",
  "CODEX_COMMAND",
  "codexRequestAt",
  "latestDeepSeekRequestAt",
  "/deepseek review",
  "hasDeepSeekEvidence"
];

const missing = requiredTokens.filter((token) => !contract.includes(token));
if (missing.length > 0) {
  throw new Error(`[AI-FRESHNESS-001] missing trusted CodeRabbit exact-head or provider-limit guard(s): ${missing.join(", ")}`);
}

const forbidden = forbiddenTokens.filter((token) => contract.includes(token));
if (forbidden.length > 0) {
  throw new Error(`[AI-FRESHNESS-001] disabled or advisory reviewer leaked into the binding gate: ${forbidden.join(", ")}`);
}

console.log("✅ AI-FRESHNESS-001 valid: Actions executes the verifier from GitHub's trusted base SHA; CodeRabbit is the sole request-bound exact-head AI reviewer; only an authenticated post-request limit/quota signal may waive its execution step; Codex, DeepSeek and Qodo cannot satisfy the binding gate.");
