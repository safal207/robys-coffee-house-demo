"use strict";

const assert = require("node:assert/strict");
const { enforceSelection } = require("./enforce-ai-review-selection.cjs");

const HEAD = "a".repeat(40);
const BASE = Date.parse("2026-07-16T00:00:00Z");
const at = (minutes) => new Date(BASE + minutes * 60_000).toISOString();
const pr = { head: { sha: HEAD } };
const headCommit = { commit: { committer: { date: at(0) } } };
const readyBody = `<!-- ai-review-cooperation -->
## AI reviewer cooperation report

**Current head:** \`${HEAD}\`  
**Overall conclusion:** **READY_WITH_ADVISORY_GAPS**  
**Why:** Required evidence is green; advisory gaps: Jules, DeepSeek.

### Evidence summary

| Reviewer | Request | Evidence |
|---|---:|---|
`;

function trustedRequest(command, minutes) {
  return {
    body: `${command}\n\nExact head: ${HEAD}`,
    created_at: at(minutes),
    author_association: "OWNER",
    user: { login: "safal207", type: "User" },
  };
}

function botComment(login, body, minutes) {
  return {
    body,
    created_at: at(minutes),
    updated_at: at(minutes),
    user: { login, type: "Bot" },
  };
}

function botReview(login, minutes) {
  return {
    body: "No findings.",
    submitted_at: at(minutes),
    state: "COMMENTED",
    commit_id: HEAD,
    user: { login, type: "Bot" },
  };
}

const baseComments = [
  trustedRequest("/qodo review", 1),
  trustedRequest("@codex review", 2),
];

const codexOnly = enforceSelection({
  pr,
  headCommit,
  comments: baseComments,
  reviews: [botReview("chatgpt-codex-connector[bot]", 3)],
  body: readyBody,
  triggerEvent: "issue_comment",
  now: BASE + 4 * 60_000,
});
assert.equal(codexOnly.selectedProvider, null);
assert.match(codexOnly.body, /Overall conclusion:\*\* \*\*WAIT_FOR_EVIDENCE/);
assert.match(codexOnly.body, /Selected provider: \*\*none\*\*/);

const qodoPrimary = enforceSelection({
  pr,
  headCommit,
  comments: baseComments,
  reviews: [botReview("qodo-code-review[bot]", 3)],
  body: readyBody,
  triggerEvent: "pull_request_review",
  now: BASE + 4 * 60_000,
});
assert.equal(qodoPrimary.selectedProvider, "Qodo");
assert.equal(qodoPrimary.selection.mode, "primary");
assert.match(qodoPrimary.body, /READY_WITH_ADVISORY_GAPS/);

const limitFailover = enforceSelection({
  pr,
  headCommit,
  comments: [
    ...baseComments,
    botComment(
      "qodo-code-review[bot]",
      "Review limit reached. Next review available in: 28 minutes.",
      3,
    ),
  ],
  reviews: [botReview("chatgpt-codex-connector[bot]", 4)],
  body: readyBody,
  triggerEvent: "workflow_run",
  workflowCreatedAt: at(0),
  now: BASE + 5 * 60_000,
});
assert.equal(limitFailover.selectedProvider, "Codex");
assert.equal(limitFailover.selection.mode, "automatic-failover");
assert.equal(limitFailover.selection.primaryFailure, "PROVIDER_LIMIT");
assert.match(limitFailover.body, /READY_WITH_ADVISORY_GAPS/);

const timeoutFailover = enforceSelection({
  pr,
  headCommit,
  comments: [
    ...baseComments,
    trustedRequest("/qodo review", 16),
  ],
  reviews: [botReview("chatgpt-codex-connector[bot]", 17)],
  body: readyBody,
  triggerEvent: "workflow_run",
  workflowCreatedAt: at(0),
  now: BASE + 31 * 60_000,
});
assert.equal(timeoutFailover.selectedProvider, "Codex");
assert.equal(timeoutFailover.selection.mode, "fallback");
assert.equal(timeoutFailover.selection.primaryFailure, "QODO_TIMEOUT_2");
assert.match(timeoutFailover.body, /READY_WITH_ADVISORY_GAPS/);

const preDispatchLimit = enforceSelection({
  pr,
  headCommit,
  comments: [
    botComment("qodo-code-review[bot]", "Review limit reached.", 1),
    trustedRequest("/qodo review", 2),
    trustedRequest("@codex review", 3),
  ],
  reviews: [botReview("chatgpt-codex-connector[bot]", 4)],
  body: readyBody,
  triggerEvent: "workflow_run",
  workflowCreatedAt: at(0),
  now: BASE + 5 * 60_000,
});
assert.equal(preDispatchLimit.selectedProvider, null);
assert.match(preDispatchLimit.body, /WAIT_FOR_EVIDENCE/);

console.log("cooperation selection guard: ok");
