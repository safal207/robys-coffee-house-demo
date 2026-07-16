import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const workflow = readFileSync(".github/workflows/ai-review-contract.yml", "utf8");
const verifier = readFileSync("scripts/verify-ai-review-contract.cjs", "utf8");
const contract = `${workflow}\n${verifier}`;
const require = createRequire(import.meta.url);
const verifierModule = require("./verify-ai-review-contract.cjs");
const selectRequiredEvidence = verifierModule?._test?.selectRequiredEvidence;
const activeProviderNames = verifierModule?._test?.ACTIVE_PROVIDER_NAMES;
const dormantProviderNames = verifierModule?._test?.DORMANT_PROVIDER_NAMES;

function assert(condition, message) {
  if (!condition) throw new Error(`[AI-FRESHNESS-001] ${message}`);
}

assert(workflow.includes("verify-ai-review-contract.cjs"), "workflow no longer delegates to the trusted verifier");
assert(typeof selectRequiredEvidence === "function", "semantic provider selector is not exported for contract verification");
assert(JSON.stringify(activeProviderNames) === JSON.stringify(["Qodo", "Codex"]), "active reviewer pool drifted");
assert(dormantProviderNames?.has("CodeRabbit") === true, "CodeRabbit is not explicitly dormant");

const forbiddenTokens = [
  "latestDeepSeekRequestAt",
  "/deepseek review",
  "hasDeepSeekEvidence"
];
const forbidden = forbiddenTokens.filter((token) => contract.includes(token));
assert(forbidden.length === 0, `optional reviewer leaked into binding gate: ${forbidden.join(", ")}`);

const HEAD = "a".repeat(40);
const STALE_HEAD = "b".repeat(40);
const ANCHOR = Date.parse("2026-07-16T00:00:00Z");
const at = (minutes) => new Date(ANCHOR + minutes * 60_000).toISOString();
const request = (command, minutes) => ({
  body: `${command}\n\nExact head: ${HEAD}`,
  created_at: at(minutes),
  author_association: "OWNER"
});
const qodoSignal = (type = "Bot") => ({
  body: "Review limit reached. Next review available in: 28 minutes.",
  created_at: at(3),
  updated_at: at(3),
  user: { login: "qodo-code-review[bot]", type }
});
const dormantRabbitSignal = () => ({
  body: "Review limit reached. Next review available in: 28 minutes.",
  created_at: at(3),
  updated_at: at(3),
  user: { login: "coderabbitai[bot]", type: "Bot" }
});
const codexReview = (commitId = HEAD) => ({
  submitted_at: at(4),
  state: "COMMENTED",
  commit_id: commitId,
  user: { login: "chatgpt-codex-connector[bot]", type: "Bot" }
});
const rabbitReview = () => ({
  submitted_at: at(4),
  state: "APPROVED",
  commit_id: HEAD,
  user: { login: "coderabbitai[bot]", type: "Bot" }
});
const baseComments = [
  request("/qodo review", 1),
  request("@codex review", 2)
];
const select = (comments, reviews) => selectRequiredEvidence({
  comments,
  reviews,
  currentHead: HEAD,
  headUpdateAnchor: ANCHOR,
  now: ANCHOR + 5 * 60_000
});

const automaticFailover = select([...baseComments, qodoSignal()], [codexReview()]);
assert(automaticFailover.provider === "Codex", "authenticated Qodo limit did not select Codex");
assert(automaticFailover.mode === "automatic-failover", `expected automatic-failover mode, found ${automaticFailover.mode}`);
assert(automaticFailover.primaryFailure === "PROVIDER_LIMIT", `expected PROVIDER_LIMIT, found ${automaticFailover.primaryFailure}`);
assert(automaticFailover.unavailableProviders?.includes("Qodo"), "limited active provider was not recorded as unavailable");
assert(automaticFailover.warmStandbyRoundReady === true, "complete Qodo-Codex dispatch was not recorded");

const missingStandbyDispatch = select(
  [request("/qodo review", 1), qodoSignal()],
  [codexReview()]
);
assert(missingStandbyDispatch.provider === null, "provider limit bypassed missing Codex dispatch");
assert(missingStandbyDispatch.mode === "pending", "incomplete dispatch opened failover mode");
assert(missingStandbyDispatch.fallbackEligible === false, "incomplete dispatch became fallback eligible");
assert(missingStandbyDispatch.warmStandbyRoundReady === false, "incomplete dispatch was marked ready");

const staleReview = select([...baseComments, qodoSignal()], [codexReview(STALE_HEAD)]);
assert(staleReview.provider === null, "stale-head review satisfied the current-head lane");
assert(staleReview.mode === "fallback-pending", "stale-head review did not leave failover pending");

const spoofedLimit = select([...baseComments, qodoSignal("User")], [codexReview()]);
assert(spoofedLimit.provider === null, "non-Bot limit signal opened automatic failover");
assert(spoofedLimit.mode === "pending", "spoofed limit signal changed provider-selection mode");

const noticeOnly = select([...baseComments, qodoSignal()], []);
assert(noticeOnly.provider === null, "provider limit notice counted as review evidence");
assert(noticeOnly.mode === "fallback-pending", "limit without alternate review did not remain fail-closed");

const dormantRabbit = select(
  [...baseComments, request("@coderabbitai review", 2), dormantRabbitSignal()],
  [rabbitReview()]
);
assert(dormantRabbit.provider === null, "dormant CodeRabbit satisfied the required lane");
assert(dormantRabbit.mode === "pending", "dormant CodeRabbit changed provider-selection mode");
assert(dormantRabbit.unavailableProviders?.length === 0, "dormant CodeRabbit limit entered active availability state");

console.log("✅ AI-FRESHNESS-001 valid: Qodo and Codex form the exact-head reviewer pool; complete active dispatch is required before failover, while dormant CodeRabbit, incomplete dispatch, spoofed or stale evidence, and notices without reviews remain fail-closed.");
