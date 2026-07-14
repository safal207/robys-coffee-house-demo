"use strict";

const assert = require("node:assert/strict");
const { _test } = require("./verify-ai-review-contract.cjs");

const HEAD = "a".repeat(40);
const ANCHOR = Date.parse("2026-07-14T00:00:00Z");
const T = (minutes) => new Date(ANCHOR + minutes * 60_000).toISOString();

function comment(body, minutes, association = "OWNER") {
  return { body, created_at: T(minutes), author_association: association };
}

function review(login, minutes, state = "COMMENTED", head = HEAD) {
  return {
    body: "",
    submitted_at: T(minutes),
    state,
    commit_id: head,
    user: { login, type: "Bot" },
  };
}

function workflowRun({
  id,
  minutes,
  head = HEAD,
  prNumber = 210,
  name = "AI review contract",
  event = "pull_request",
  includePr = true,
}) {
  return {
    id,
    name,
    event,
    head_sha: head,
    created_at: T(minutes),
    pull_requests: includePr ? [{ number: prNumber }] : [],
  };
}

function select(comments, reviews, nowMinutes) {
  return _test.selectRequiredEvidence({
    comments,
    reviews,
    currentHead: HEAD,
    headUpdateAnchor: ANCHOR,
    now: ANCHOR + nowMinutes * 60_000,
  });
}

{
  const anchor = _test.stableHeadUpdateAnchor(
    [
      workflowRun({ id: 11, minutes: 1 }),
      workflowRun({ id: 12, minutes: 31 }),
      workflowRun({ id: 13, minutes: 0, prNumber: 999 }),
      workflowRun({ id: 14, minutes: 0, head: "b".repeat(40) }),
      workflowRun({ id: 15, minutes: 0, name: "Other workflow" }),
    ],
    HEAD,
    210,
    12,
  );
  assert.equal(anchor, ANCHOR + 60_000);
}

{
  const anchor = _test.stableHeadUpdateAnchor(
    [workflowRun({ id: 77, minutes: 4, includePr: false })],
    HEAD,
    210,
    77,
  );
  assert.equal(anchor, ANCHOR + 4 * 60_000);
}

{
  const result = select(
    [comment("/qodo review", 1)],
    [review("qodo-code-review", 3)],
    4,
  );
  assert.equal(result.provider, "Qodo");
  assert.equal(result.mode, "primary");
  assert.equal(result.primaryFailure, "none");
}

{
  const result = select(
    [
      comment("/qodo review", 1),
      comment("/qodo review", 16),
      comment("@codex review", 17),
    ],
    [review("chatgpt-codex-connector[bot]", 18)],
    30,
  );
  assert.equal(result.provider, null);
  assert.equal(result.mode, "pending");
}

{
  // Simulates a later rerun that retained the earliest exact-head workflow anchor.
  const result = select(
    [
      comment("/qodo review", 1),
      comment("/qodo review", 16),
      comment("@codex review", 17),
    ],
    [review("chatgpt-codex-connector[bot]", 18)],
    31,
  );
  assert.equal(result.provider, "Codex");
  assert.equal(result.mode, "fallback");
  assert.equal(result.primaryFailure, "QODO_TIMEOUT_2");
}

{
  const result = select(
    [
      comment("/qodo review", 1),
      comment("/qodo review", 16),
      comment("@coderabbitai review", 17),
    ],
    [review("coderabbitai[bot]", 20)],
    31,
  );
  assert.equal(result.provider, "CodeRabbit");
  assert.equal(result.mode, "fallback");
}

{
  const result = select(
    [
      comment("/qodo review", 1),
      comment("/qodo review", 16),
      comment("@codex review", 17),
    ],
    [
      review("chatgpt-codex-connector[bot]", 18),
      review("qodo-code-review", 25),
    ],
    31,
  );
  assert.equal(result.provider, "Qodo");
  assert.equal(result.mode, "primary");
}

{
  const result = select(
    [
      comment("/qodo review", 1),
      comment("/qodo review", 16),
      comment("@codex review", 17, "NONE"),
    ],
    [review("chatgpt-codex-connector[bot]", 18)],
    31,
  );
  assert.equal(result.provider, null);
  assert.equal(result.mode, "fallback-pending");
}

{
  const result = select(
    [
      comment("/qodo review", 1),
      comment("/qodo review", 16),
      comment("@codex review", 17),
    ],
    [review("chatgpt-codex-connector-evil", 18)],
    31,
  );
  assert.equal(result.provider, null);
}

{
  const result = select(
    [
      comment("/qodo review", 1),
      comment("/qodo review", 16),
      comment("@codex review", 17),
    ],
    [review("chatgpt-codex-connector[bot]", 18, "DISMISSED")],
    31,
  );
  assert.equal(result.provider, null);
}

{
  const result = select(
    [
      comment("/qodo review", 1),
      comment("/qodo review", 16),
      comment("@codex review", 17),
    ],
    [review("chatgpt-codex-connector[bot]", 18, "COMMENTED", "b".repeat(40))],
    31,
  );
  assert.equal(result.provider, null);
}

console.log("provider-pool contract: ok");
