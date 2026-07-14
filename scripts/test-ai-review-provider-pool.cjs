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
