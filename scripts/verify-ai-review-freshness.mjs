import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/ai-review-contract.yml", "utf8");
const verifier = readFileSync("scripts/verify-ai-review-contract.cjs", "utf8");
const contract = `${workflow}\n${verifier}`;

const requiredTokens = [
  "verify-ai-review-contract.cjs",
  "github.event.pull_request.base.sha",
  "currentHead",
  "commit_id",
  "CODEX_COMMAND",
  "codexRequestAt",
  "DORMANT_PROVIDER_NAMES"
];

const forbiddenTokens = [
  "QODO_COMMAND",
  "/qodo review",
  "qodoRequestAt",
  "warmStandbyRoundReady",
  "Qodo remains primary",
  "ref: 577dfd5eebe75038ee067830e6b0c70815fcc837",
  "latestDeepSeekRequestAt",
  "/deepseek review",
  "hasDeepSeekEvidence"
];

const missing = requiredTokens.filter((token) => !contract.includes(token));
if (missing.length > 0) {
  throw new Error(`[AI-FRESHNESS-001] missing trusted Codex-only exact-head guard(s): ${missing.join(", ")}`);
}

const forbidden = forbiddenTokens.filter((token) => contract.includes(token));
if (forbidden.length > 0) {
  throw new Error(`[AI-FRESHNESS-001] disabled or optional reviewer leaked into binding gate: ${forbidden.join(", ")}`);
}

console.log("✅ AI-FRESHNESS-001 valid: Actions executes the verifier from GitHub's trusted base SHA; Codex is the sole request-bound exact-head reviewer, while Qodo, CodeRabbit and optional reviewers cannot block or satisfy readiness.");
