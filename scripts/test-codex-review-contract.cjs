"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const verifier = require("./verify-ai-review-contract.cjs")._test;

const head = "1234567890abcdef1234567890abcdef12345678";
const anchor = Date.parse("2026-07-20T10:00:00Z");
const requestAt = "2026-07-20T10:01:00Z";
const reviewAt = "2026-07-20T10:02:00Z";

function request(body = `@coderabbitai review\nExact head: ${head}`, overrides = {}) {
  return {
    body,
    author_association: "OWNER",
    created_at: requestAt,
    user: { login: "safal207", type: "User" },
    ...overrides,
  };
}

function actionRequest(overrides = {}) {
  return request(`${verifier.CODERABBIT_MARKER}\n@coderabbitai review\n\nExact head: ${head}`, {
    author_association: "NONE",
    user: { login: "github-actions[bot]", type: "Bot" },
    ...overrides,
  });
}

function nativeReview(overrides = {}) {
  return {
    user: { login: "coderabbitai[bot]", type: "Bot" },
    state: "COMMENTED",
    submitted_at: reviewAt,
    commit_id: head,
    body: "CodeRabbit review complete.",
    ...overrides,
  };
}

function rabbitComment(overrides = {}) {
  return {
    user: { login: "coderabbitai[bot]", type: "Bot" },
    created_at: reviewAt,
    updated_at: reviewAt,
    body: `CodeRabbit Review: completed.\n\n**Reviewed commit:** \`${head.slice(0, 10)}\``,
    ...overrides,
  };
}

function limitComment(body = "Review limit reached. Next review available in 2 hours.", overrides = {}) {
  return {
    user: { login: "coderabbitai[bot]", type: "Bot" },
    created_at: reviewAt,
    updated_at: reviewAt,
    body,
    ...overrides,
  };
}

const workflow = readFileSync(".github/workflows/ai-review-contract.yml", "utf8");
assert(workflow.includes("types: [opened, synchronize]"));
assert(workflow.includes("Verify exact-head CodeRabbit review or limit waiver"));
assert(workflow.includes("Wait for exact-head CodeRabbit evidence or explicit limit signal"));

const ledgerWorkflow = readFileSync(".github/workflows/review-ledger.yml", "utf8");
assert(ledgerWorkflow.includes("const codeRabbitRequests = issueComments"));
assert(ledgerWorkflow.includes("const hasPositiveLimitSignal = (body) => {"));
assert(ledgerWorkflow.includes("provider-limit-waived"));
assert(ledgerWorkflow.includes("new Set(['CodeRabbit', 'Codex', 'Jules', 'DeepSeek'])"));
assert(ledgerWorkflow.includes("text.matchAll(/_([^_\\n]+)_/g)"));

assert.deepEqual(verifier.ACTIVE_PROVIDER_NAMES, ["CodeRabbit"]);
assert(verifier.ADVISORY_PROVIDER_NAMES.has("Codex"));
assert(verifier.ADVISORY_PROVIDER_NAMES.has("DeepSeek"));
assert(verifier.DORMANT_PROVIDER_NAMES.has("Qodo"));

const accepted = verifier.selectRequiredEvidence({
  comments: [request()],
  reviews: [nativeReview()],
  currentHead: head,
  headUpdateAnchor: anchor,
});
assert.equal(accepted.provider, "CodeRabbit");
assert.equal(accepted.mode, "coderabbit-required");
assert.equal(accepted.providerLimitWaived, false);

const actionAccepted = verifier.selectRequiredEvidence({
  comments: [actionRequest()],
  reviews: [nativeReview()],
  currentHead: head,
  headUpdateAnchor: anchor,
});
assert.equal(actionAccepted.provider, "CodeRabbit");

const commentEvidence = verifier.selectRequiredEvidence({
  comments: [request(), rabbitComment()],
  reviews: [],
  currentHead: head,
  headUpdateAnchor: anchor,
});
assert.equal(commentEvidence.provider, "CodeRabbit");
assert.equal(commentEvidence.mode, "coderabbit-required");

const limitBypass = verifier.selectRequiredEvidence({
  comments: [request(), limitComment()],
  reviews: [],
  currentHead: head,
  headUpdateAnchor: anchor,
});
assert.equal(limitBypass.provider, "CodeRabbit");
assert.equal(limitBypass.mode, "provider-limit-bypass");
assert.equal(limitBypass.providerLimitWaived, true);

for (const body of [
  "No review limit was reached; review is starting.",
  "CodeRabbit review started and is in progress.",
  "CodeRabbit review failed because the provider is unavailable.",
  "Generic provider error.",
]) {
  const pending = verifier.selectRequiredEvidence({
    comments: [request(), limitComment(body)],
    reviews: [],
    currentHead: head,
    headUpdateAnchor: anchor,
  });
  assert.equal(pending.provider, null, `${body} must not satisfy or waive the required lane`);
}

const staleLimit = verifier.selectRequiredEvidence({
  comments: [
    limitComment(undefined, { created_at: "2026-07-20T10:00:30Z" }),
    request(),
  ],
  reviews: [],
  currentHead: head,
  headUpdateAnchor: anchor,
});
assert.equal(staleLimit.provider, null);

const staleRequest = verifier.selectRequiredEvidence({
  comments: [request(undefined, { created_at: "2026-07-20T09:59:59Z" })],
  reviews: [nativeReview()],
  currentHead: head,
  headUpdateAnchor: anchor,
});
assert.equal(staleRequest.provider, null);

const wrongHead = verifier.selectRequiredEvidence({
  comments: [request(`@coderabbitai review\nExact head: ${"a".repeat(40)}`)],
  reviews: [nativeReview()],
  currentHead: head,
  headUpdateAnchor: anchor,
});
assert.equal(wrongHead.provider, null);

const untrusted = verifier.selectRequiredEvidence({
  comments: [request(undefined, { author_association: "NONE" })],
  reviews: [nativeReview()],
  currentHead: head,
  headUpdateAnchor: anchor,
});
assert.equal(untrusted.provider, null);

const codexOnly = verifier.selectRequiredEvidence({
  comments: [request(`@codex review\nExact head: ${head}`)],
  reviews: [{ ...nativeReview(), user: { login: "chatgpt-codex-connector[bot]", type: "Bot" } }],
  currentHead: head,
  headUpdateAnchor: anchor,
});
assert.equal(codexOnly.provider, null);

const preRequestReview = verifier.selectRequiredEvidence({
  comments: [request()],
  reviews: [nativeReview({ submitted_at: "2026-07-20T10:00:30Z" })],
  currentHead: head,
  headUpdateAnchor: anchor,
});
assert.equal(preRequestReview.provider, null);

console.log("✅ AI-REVIEW-001 passed: CodeRabbit is the required exact-head reviewer; only final authenticated evidence satisfies the normal lane; a positive post-request CodeRabbit limit/quota signal activates the narrow provider-limit waiver; silence, progress, generic failure, stale output and Codex advisory evidence cannot satisfy it.");
