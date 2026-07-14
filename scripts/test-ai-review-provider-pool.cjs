"use strict";

const assert = require("node:assert/strict");
const { _test } = require("./verify-ai-review-contract.cjs");

const HEAD = "a".repeat(40);
const OLD_HEAD = "b".repeat(40);
const ANCHOR = Date.parse("2026-07-14T00:00:00Z");
const T = (minutes) => new Date(ANCHOR + minutes * 60_000).toISOString();

function comment(body, minutes, association = "OWNER") {
  return { body, created_at: T(minutes), author_association: association };
}

function request(command, minutes, association = "OWNER", head = HEAD) {
  return comment(`${command}\n\nExact head: ${head}`, minutes, association);
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
  name = "AI review contract",
  event = "pull_request",
  runAttempt = 1,
}) {
  return {
    id,
    name,
    event,
    head_sha: head,
    created_at: T(minutes),
    run_attempt: runAttempt,
    pull_requests: [],
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
    workflowRun({ id: 77, minutes: 4, runAttempt: 3 }),
    HEAD,
    77,
  );
  assert.equal(anchor, ANCHOR + 4 * 60_000);
}

{
  const anchor = _test.stableHeadUpdateAnchor(
    workflowRun({ id: 11, minutes: 1 }),
    HEAD,
    99,
  );
  assert.equal(anchor, 0);
}

{
  const wrongHead = _test.stableHeadUpdateAnchor(
    workflowRun({ id: 77, minutes: 4, head: OLD_HEAD }),
    HEAD,
    77,
  );
  const wrongName = _test.stableHeadUpdateAnchor(
    workflowRun({ id: 77, minutes: 4, name: "Other workflow" }),
    HEAD,
    77,
  );
  const wrongEvent = _test.stableHeadUpdateAnchor(
    workflowRun({ id: 77, minutes: 4, event: "push" }),
    HEAD,
    77,
  );
  assert.equal(wrongHead, 0);
  assert.equal(wrongName, 0);
  assert.equal(wrongEvent, 0);
}

{
  assert.equal(_test.hasExactHeadBinding(request("/qodo review", 1), HEAD), true);
  assert.equal(_test.hasExactHeadBinding(comment("/qodo review", 1), HEAD), false);
  assert.equal(_test.hasExactHeadBinding(request("/qodo review", 1, "OWNER", OLD_HEAD), HEAD), false);
}

{
  const result = select(
    [request("/qodo review", 1)],
    [review("qodo-code-review", 3)],
    4,
  );
  assert.equal(result.provider, "Qodo");
  assert.equal(result.mode, "primary");
  assert.equal(result.primaryFailure, "none");
}

{
  const result = select(
    [comment("/qodo review", 1)],
    [review("qodo-code-review", 3)],
    4,
  );
  assert.equal(result.provider, null);
  assert.equal(result.primaryFailure, "QODO_TIMEOUT_1_PENDING");
}

{
  const result = select(
    [request("/qodo review", 1, "OWNER", OLD_HEAD)],
    [review("qodo-code-review", 3)],
    4,
  );
  assert.equal(result.provider, null);
}

{
  const result = select(
    [
      request("/qodo review", 1),
      request("/qodo review", 16),
      request("@codex review", 17),
    ],
    [review("chatgpt-codex-connector[bot]", 18)],
    30,
  );
  assert.equal(result.provider, null);
  assert.equal(result.mode, "pending");
}

{
  // Simulates a later attempt of the same workflow run with the original created_at anchor.
  const result = select(
    [
      request("/qodo review", 1),
      request("/qodo review", 16),
      request("@codex review", 17),
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
      request("/qodo review", 1),
      request("/qodo review", 16),
      request("@coderabbitai review", 17),
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
      request("/qodo review", 1),
      request("/qodo review", 16),
      request("@codex review", 17),
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
      request("/qodo review", 1),
      request("/qodo review", 16),
      request("@codex review", 17, "NONE"),
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
      request("/qodo review", 1),
      request("/qodo review", 16),
      request("@codex review", 17),
    ],
    [review("chatgpt-codex-connector-evil", 18)],
    31,
  );
  assert.equal(result.provider, null);
}

{
  const result = select(
    [
      request("/qodo review", 1),
      request("/qodo review", 16),
      request("@codex review", 17),
    ],
    [review("chatgpt-codex-connector[bot]", 18, "DISMISSED")],
    31,
  );
  assert.equal(result.provider, null);
}

{
  const result = select(
    [
      request("/qodo review", 1),
      request("/qodo review", 16),
      request("@codex review", 17),
    ],
    [review("chatgpt-codex-connector[bot]", 18, "COMMENTED", OLD_HEAD)],
    31,
  );
  assert.equal(result.provider, null);
}

console.log("provider-pool contract: ok");
