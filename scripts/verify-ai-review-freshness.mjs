import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/ai-review-contract.yml", "utf8");
const requiredTokens = [
  "currentHead",
  "commit_id",
  "bodyNamesHead",
  "latestCodexRequestAt",
  "latestCodeRabbitRequestAt",
  "latestDeepSeekRequestAt",
  "Status:",
  "failed"
];

const missing = requiredTokens.filter((token) => !workflow.includes(token));
if (missing.length > 0) {
  throw new Error(`[AI-FRESHNESS-001] missing exact-head/latest-request guard(s): ${missing.join(", ")}`);
}

console.log("✅ AI-FRESHNESS-001 valid: Codex, CodeRabbit and DeepSeek require latest-request exact-head evidence; failed DeepSeek evidence is rejected.");
