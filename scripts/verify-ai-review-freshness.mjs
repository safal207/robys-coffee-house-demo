import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const workflow = readFileSync(".github/workflows/ai-review-contract.yml", "utf8");
const verifier = readFileSync("scripts/verify-ai-review-contract.cjs", "utf8");
const contract = `${workflow}\n${verifier}`;
const require = createRequire(import.meta.url);
const verifierModule = require("./verify-ai-review-contract.cjs");
const selectRequiredEvidence = verifierModule?._test?.selectRequiredEvidence;

function assert(condition, message) {
  if (!condition) throw new Error(`[AI-FRESHNESS-001] ${message}`);
}

assert(workflow.includes("verify-ai-review-contract.cjs"), "workflow no longer delegates to the trusted verifier");
assert(typeof selectRequiredEvidence === "function", "semantic provider selector is not exported for contract verification");

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
const providerSignal = (type = "Bot") => ({
  body: "Review limit reached. Next review available in: 28 minutes.",
  created_at: at(3),
  updated_at: at(3),
  user: { login: "coderabbitai[bot]", type }
});
const codexReview = (commitId = HEAD) => ({
  submitted_at: at(4),
  state: "COMMENTED",
  commit_id: commitId,
  user: { login: "chatgpt-codex-connector[bot]", type: "Bot" }
});
const baseComments = [
  request("/qodo review", 1),
  request("@codex review", 2),
  request("@coderabbitai review", 2)
];
const select = (comments, reviews) => selectRequiredEvidence({
  comments,
  reviews,
  currentHead: HEAD,
  headUpdateAnchor: ANCHOR,
  now: ANCHOR + 5 * 60_000
});

const automaticFailover = select([...baseComments, providerSignal()], [codexReview()]);
assert(automaticFailover.provider === "Codex", "authenticated provider limit did not select the warm-standby Codex review");
assert(automaticFailover.mode === "automatic-failover", `expected automatic-failover mode, found ${automaticFailover.mode}`);
assert(automaticFailover.primaryFailure === "PROVIDER_LIMIT", `expected PROVIDER_LIMIT, found ${automaticFailover.primaryFailure}`);
assert(automaticFailover.unavailableProviders?.includes("CodeRabbit"), "limited provider was not recorded as unavailable");
assert(automaticFailover.warmStandbyRoundReady === true, "complete three-provider dispatch was not recorded");

const missingPrimaryDispatch = select(
  [request("@codex review", 2), request("@coderabbitai review", 2), providerSignal()],
  [codexReview()]
);
assert(missingPrimaryDispatch.provider === null, "provider limit bypassed the missing Qodo dispatch");
assert(missingPrimaryDispatch.mode === "pending", "incomplete dispatch opened failover mode");
assert(missingPrimaryDispatch.fallbackEligible === false, "incomplete dispatch became fallback eligible");
assert(missingPrimaryDispatch.warmStandbyRoundReady === false, "incomplete dispatch was marked ready");

const staleReview = select([...baseComments, providerSignal()], [codexReview(STALE_HEAD)]);
assert(staleReview.provider === null, "stale-head review satisfied the current-head lane");
assert(staleReview.mode === "fallback-pending", "stale-head review did not leave failover pending");

const spoofedLimit = select([...baseComments, providerSignal("User")], [codexReview()]);
assert(spoofedLimit.provider === null, "non-Bot limit signal opened automatic failover");
assert(spoofedLimit.mode === "pending", "spoofed limit signal changed provider-selection mode");

const noticeOnly = select([...baseComments, providerSignal()], []);
assert(noticeOnly.provider === null, "provider limit notice counted as review evidence");
assert(noticeOnly.mode === "fallback-pending", "limit without alternate review did not remain fail-closed");

console.log("✅ AI-FRESHNESS-001 valid: exact-head evidence is enforced semantically; all three reviewers must be dispatched before authenticated provider-limit failover, while incomplete dispatch, spoofed or stale evidence, and notices without reviews remain fail-closed.");
