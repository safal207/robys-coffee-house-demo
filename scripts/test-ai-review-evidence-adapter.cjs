"use strict";

const assert = require("node:assert/strict");
const adapter = require("./verify-ai-review-evidence-adapter.cjs")._test;

const head = "1234567890abcdef1234567890abcdef12345678";
const otherHead = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const anchor = Date.parse("2026-07-21T06:20:00Z");
const requestAt = "2026-07-21T06:21:00Z";
const updatedAt = "2026-07-21T06:22:00Z";

function request(overrides = {}) {
  return {
    body: `@coderabbitai review\n\nExact head: ${head}`,
    author_association: "OWNER",
    created_at: requestAt,
    updated_at: requestAt,
    user: { login: "safal207", type: "User" },
    ...overrides,
  };
}

function walkthrough(overrides = {}) {
  return {
    body:
      "<!-- review_stack_entry_start -->\n" +
      "<!-- walkthrough_start -->\n" +
      `Reviewing files changed between ${otherHead} and ${head}.\n` +
      "## Walkthrough\nReview completed.",
    author_association: "NONE",
    created_at: "2026-07-21T06:00:00Z",
    updated_at: updatedAt,
    user: { login: "coderabbitai[bot]", type: "Bot" },
    ...overrides,
  };
}

const accepted = adapter.selectWalkthroughEvidence({
  comments: [request(), walkthrough()],
  currentHead: head,
  headUpdateAnchor: anchor,
});
assert(accepted, "a reused CodeRabbit summary updated after the request must be accepted");
assert.equal(adapter.observedTimeOf(accepted), Date.parse(updatedAt));

const staleUpdate = adapter.selectWalkthroughEvidence({
  comments: [request(), walkthrough({ updated_at: "2026-07-21T06:20:30Z" })],
  currentHead: head,
  headUpdateAnchor: anchor,
});
assert.equal(staleUpdate, null, "a pre-request update must not satisfy the lane");

const wrongHead = adapter.selectWalkthroughEvidence({
  comments: [request(), walkthrough({ body: `<!-- walkthrough_start -->\nReviewed ${otherHead}.` })],
  currentHead: head,
  headUpdateAnchor: anchor,
});
assert.equal(wrongHead, null, "walkthrough evidence must include the full current head");

const quotaBody = adapter.selectWalkthroughEvidence({
  comments: [request(), walkthrough({ body: `<!-- walkthrough_start -->\n${head}\nReview limit reached.` })],
  currentHead: head,
  headUpdateAnchor: anchor,
});
assert.equal(quotaBody, null, "a quota response must remain in the legacy waiver lane");

const spoofedBot = adapter.selectWalkthroughEvidence({
  comments: [request(), walkthrough({ user: { login: "attacker", type: "Bot" } })],
  currentHead: head,
  headUpdateAnchor: anchor,
});
assert.equal(spoofedBot, null, "only the configured CodeRabbit bot may publish walkthrough evidence");

const editedOldRequest = adapter.selectWalkthroughEvidence({
  comments: [
    request({ created_at: "2026-07-21T06:19:00Z", updated_at: requestAt }),
    walkthrough(),
  ],
  currentHead: head,
  headUpdateAnchor: anchor,
});
assert.equal(editedOldRequest, null, "editing an old request must not refresh its authority");

const secondRequestAt = "2026-07-21T06:23:00Z";
const beforeLatestRequest = adapter.selectWalkthroughEvidence({
  comments: [
    request(),
    request({ created_at: secondRequestAt, updated_at: secondRequestAt }),
    walkthrough({ updated_at: "2026-07-21T06:22:30Z" }),
  ],
  currentHead: head,
  headUpdateAnchor: anchor,
});
assert.equal(beforeLatestRequest, null, "walkthrough evidence must follow the latest exact-head request");

const afterLatestRequest = adapter.selectWalkthroughEvidence({
  comments: [
    request(),
    request({ created_at: secondRequestAt, updated_at: secondRequestAt }),
    walkthrough({ updated_at: "2026-07-21T06:24:00Z" }),
  ],
  currentHead: head,
  headUpdateAnchor: anchor,
});
assert(afterLatestRequest, "an updated walkthrough after the latest request must be accepted");

assert.equal(
  adapter.stableHeadUpdateAnchor(
    {
      id: 77,
      name: "AI review contract",
      event: "pull_request",
      head_sha: head,
      created_at: "2026-07-21T06:20:00Z",
    },
    head,
    77,
  ),
  anchor,
);

console.log("✅ AI-REVIEW-ADAPTER-001 passed: stable CodeRabbit walkthrough comments are accepted only after a fresh exact-head request, with authenticated bot identity, updated_at freshness, full current-head binding, and no quota signal.");
