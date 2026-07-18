"use strict";

const assert = require("node:assert/strict");
const verifier = require("./verify-ai-review-contract.cjs")._test;

const head = "1234567890abcdef1234567890abcdef12345678";
const anchor = Date.parse("2026-07-18T10:00:00Z");
const requestAt = "2026-07-18T10:01:00Z";
const reviewAt = "2026-07-18T10:02:00Z";

function request(body = `@codex review\nExact head: ${head}`, overrides = {}) {
  return {
    body,
    author_association: "OWNER",
    created_at: requestAt,
    ...overrides,
  };
}

function nativeReview(overrides = {}) {
  return {
    user: { login: "chatgpt-codex-connector[bot]", type: "Bot" },
    state: "COMMENTED",
    submitted_at: reviewAt,
    commit_id: head,
    body: "Codex review complete.",
    ...overrides,
  };
}

function codexComment(overrides = {}) {
  return {
    user: { login: "chatgpt-codex-connector[bot]", type: "Bot" },
    created_at: reviewAt,
    updated_at: reviewAt,
    body: `Codex Review: Didn't find any major issues.\n\n**Reviewed commit:** \`${head.slice(0, 10)}\``,
    ...overrides,
  };
}

assert.deepEqual(verifier.ACTIVE_PROVIDER_NAMES, ["Codex"]);
assert(verifier.DORMANT_PROVIDER_NAMES.has("Qodo"));
assert(verifier.DORMANT_PROVIDER_NAMES.has("CodeRabbit"));

const accepted = verifier.selectRequiredEvidence({
  comments: [request()],
  reviews: [nativeReview()],
  currentHead: head,
  headUpdateAnchor: anchor,
});
assert.equal(accepted.provider, "Codex");
assert.equal(accepted.mode, "codex-only");

const commentEvidence = verifier.selectRequiredEvidence({
  comments: [request(), codexComment()],
  reviews: [],
  currentHead: head,
  headUpdateAnchor: anchor,
});
assert.equal(commentEvidence.provider, "Codex");

const editedPreRequestComment = verifier.selectRequiredEvidence({
  comments: [
    request(),
    codexComment({
      created_at: "2026-07-18T10:00:30Z",
      updated_at: reviewAt,
    }),
  ],
  reviews: [],
  currentHead: head,
  headUpdateAnchor: anchor,
});
assert.equal(editedPreRequestComment.provider, null);

const staleRequest = verifier.selectRequiredEvidence({
  comments: [request(undefined, { created_at: "2026-07-18T09:59:59Z" })],
  reviews: [nativeReview()],
  currentHead: head,
  headUpdateAnchor: anchor,
});
assert.equal(staleRequest.provider, null);

const wrongHead = verifier.selectRequiredEvidence({
  comments: [request(`@codex review\nExact head: ${"a".repeat(40)}`)],
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

const qodoOnly = verifier.selectRequiredEvidence({
  comments: [request(`/qodo review\nExact head: ${head}`)],
  reviews: [nativeReview()],
  currentHead: head,
  headUpdateAnchor: anchor,
});
assert.equal(qodoOnly.provider, null);

const preRequestReview = verifier.selectRequiredEvidence({
  comments: [request()],
  reviews: [nativeReview({ submitted_at: "2026-07-18T10:00:30Z" })],
  currentHead: head,
  headUpdateAnchor: anchor,
});
assert.equal(preRequestReview.provider, null);

console.log("✅ AI-CODEX-ONLY-001 passed: Codex is the sole active exact-head reviewer; edited pre-request comments, Qodo and CodeRabbit cannot satisfy the gate.");
