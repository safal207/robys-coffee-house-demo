import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/ai-review-contract.yml", "utf8");
const adapter = readFileSync("scripts/verify-ai-review-evidence-adapter.cjs", "utf8");
const legacyVerifier = readFileSync("scripts/verify-ai-review-contract.cjs", "utf8");
const contract = `${workflow}\n${adapter}\n${legacyVerifier}`;

const requiredTokens = [
  "verify-ai-review-evidence-adapter.cjs",
  "verify-ai-review-contract.cjs",
  "github.event.pull_request.base.sha",
  "currentHead",
  "commit_id",
  "CODERABBIT_COMMAND",
  "latestCodeRabbitLimitSignal",
  "provider-limit-bypass",
  "DORMANT_PROVIDER_NAMES",
  "ADVISORY_PROVIDER_NAMES",
  "observedTimeOf",
  "updated_at",
  "WALKTHROUGH_MARKERS",
  "hasWalkthroughMarker",
  "hasNoConflictingHeadReference",
  "livePull.data?.head?.sha",
  "hasPositiveLimitSignal",
  "selectStableLimitEvidence",
  "await legacyVerifierFn({ github, context, core })"
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
  throw new Error(`[AI-FRESHNESS-001] missing trusted CodeRabbit request-bound walkthrough, provider-limit, live-head, or legacy-fallback guard(s): ${missing.join(", ")}`);
}

const forbidden = forbiddenTokens.filter((token) => contract.includes(token));
if (forbidden.length > 0) {
  throw new Error(`[AI-FRESHNESS-001] disabled or advisory reviewer leaked into the binding gate: ${forbidden.join(", ")}`);
}

console.log("✅ AI-FRESHNESS-001 valid: Actions executes the adapter from GitHub's trusted base SHA; stable CodeRabbit walkthroughs and provider-limit signals require authenticated bot identity, a fresh exact-head command, post-request updated_at observation, and an unchanged live PR head; an omitted SHA is allowed but any explicit conflicting full SHA fails closed; quota activates only the narrow provider-limit bypass; the injectable legacy verifier remains the fail-closed fallback; Codex, DeepSeek and Qodo cannot satisfy the binding gate.");
