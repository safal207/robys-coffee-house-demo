"use strict";

const assert = require("node:assert/strict");
const { _test } = require("./verify-ai-review-contract.cjs");

const HEAD = "a".repeat(40);
const OLD_HEAD = "b".repeat(40);
const ANCHOR = Date.parse("2026-07-14T00:00:00Z");
const T = (minutes) => new Date(ANCHOR + minutes * 60_000).toISOString();

function comment(body, minutes, association = "OWNER", login, type) {
  return {
    body,
    created_at: T(minutes),
    author_association: association,
    user: login ? { login, type: type ?? "Bot" } : undefined,
  };
}

function request(command, minutes, association = "OWNER", head = HEAD) {
  return comment(`${command}\n\nExact head: ${head}`, minutes, association);
}

function limitSignal(login, minutes, body = "Review limit reached. Next review available in: 28 minutes.", type = "Bot", updatedMinutes) {
  const item = comment(body, minutes, "NONE", login, type);
  if (updatedMinutes !== undefined) item.updated_at = T(updatedMinutes);
  return item;
}

function review(login, minutes, state = "COMMENTED", head = HEAD, type = "Bot") {
  return {
    body: "",
    submitted_at: T(minutes),
    state,
    commit_id: head,
    user: { login, type },
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

assert.deepEqual(_test.ACTIVE_PROVIDER_NAMES, ["Qodo", "Codex"]);
assert.equal(_test.DORMANT_PROVIDER_NAMES.has("CodeRabbit"), true);

{
  const anchor = _test.stableHeadUpdateAnchor(
    workflowRun({ id: 77, minutes: 4, runAttempt: 3 }),
    HEAD,
    77,
  );
  assert.equal(anchor, ANCHOR + 4 * 60_000);
}

{
  assert.equal(
    _test.stableHeadUpdateAnchor(workflowRun({ id: 11, minutes: 1 }), HEAD, 99),
    0,
  );
  assert.equal(
    _test.stableHeadUpdateAnchor(workflowRun({ id: 77, minutes: 4, head: OLD_HEAD }), HEAD, 77),
    0,
  );
  assert.equal(
    _test.stableHeadUpdateAnchor(workflowRun({ id: 77, minutes: 4, name: "Other workflow" }), HEAD, 77),
    0,
  );
  assert.equal(
    _test.stableHeadUpdateAnchor(workflowRun({ id: 77, minutes: 4, event: "push" }), HEAD, 77),
    0,
  );
}

{
  assert.equal(_test.pullHeadMatches({ head: { sha: HEAD } }, HEAD), true);
  assert.equal(_test.pullHeadMatches({ head: { sha: OLD_HEAD } }, HEAD), false);
  assert.equal(_test.pullHeadMatches({}, HEAD), false);
}

{
  assert.equal(_test.hasExactHeadBinding(request("/qodo review", 1), HEAD), true);
  assert.equal(_test.hasExactHeadBinding(comment("/qodo review", 1), HEAD), false);
  assert.equal(_test.hasExactHeadBinding(request("/qodo review", 1, "OWNER", OLD_HEAD), HEAD), false);
}

{
  assert.equal(
    _test.stripQuotedAndFencedMarkdown("> Review limit reached\nvisible\n```\nQuota exceeded\n```"),
    "visible",
  );
  assert.equal(
    _test.hasPositiveProviderLimitSignal("Review limit reached. Next review available in: 28 minutes."),
    true,
  );
  assert.equal(_test.hasPositiveProviderLimitSignal("No review limit reached; review can continue."), false);
  assert.equal(_test.hasPositiveProviderLimitSignal("Review limit not reached; review can continue."), false);
  assert.equal(_test.hasPositiveProviderLimitSignal("This is not a rate limit reached condition."), false);
  assert.equal(_test.hasPositiveProviderLimitSignal("> Review limit reached\nNormal status update."), false);
  assert.equal(
    _test.hasPositiveProviderLimitSignal("```text\nReview limit reached\n```\nNormal status update."),
    false,
  );
  assert.equal(_test.hasPositiveProviderLimitSignal("> old quote\nReview limit reached."), true);
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
      request("@codex review", 2),
    ],
    [review("chatgpt-codex-connector[bot]", 18)],
    30,
  );
  assert.equal(result.provider, null);
  assert.equal(result.mode, "pending");
  assert.equal(result.warmStandbyRoundReady, true);
}

{
  const result = select(
    [
      request("/qodo review", 1),
      request("/qodo review", 16),
      request("@codex review", 2),
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
    [request("/qodo review", 1), request("/qodo review", 16)],
    [review("chatgpt-codex-connector[bot]", 18)],
    31,
  );
  assert.equal(result.provider, null);
  assert.equal(result.mode, "pending");
  assert.equal(result.fallbackEligible, false);
  assert.equal(result.warmStandbyRoundReady, false);
  assert.deepEqual(result.requestedProviders, ["Qodo"]);
}

{
  const result = select(
    [
      request("/qodo review", 1),
      request("/qodo review", 16),
      request("/qodo review", 20),
      request("@codex review", 2),
    ],
    [review("chatgpt-codex-connector[bot]", 18)],
    31,
  );
  assert.equal(result.provider, "Codex");
  assert.equal(result.timeoutPair.secondAt, ANCHOR + 16 * 60_000);
  assert.equal(result.fallbackEligibleAt, ANCHOR + 31 * 60_000);
}

{
  const result = select(
    [
      request("/qodo review", 1),
      request("@codex review", 2),
      limitSignal("qodo-code-review[bot]", 3, "Quota exceeded for reviews."),
    ],
    [review("chatgpt-codex-connector[bot]", 4)],
    5,
  );
  assert.equal(result.provider, "Codex");
  assert.equal(result.mode, "automatic-failover");
  assert.equal(result.primaryFailure, "PROVIDER_LIMIT");
  assert.deepEqual(result.unavailableProviders, ["Qodo"]);
  assert.equal(result.warmStandbyRoundReady, true);
  assert.equal(result.roundReadyAt, ANCHOR + 2 * 60_000);
}

{
  const result = select(
    [
      request("/qodo review", 1),
      limitSignal("qodo-code-review[bot]", 2, "Quota exceeded for reviews."),
      request("@codex review", 3),
    ],
    [review("chatgpt-codex-connector[bot]", 4)],
    5,
  );
  assert.equal(result.provider, null);
  assert.equal(result.mode, "pending");
  assert.deepEqual(result.unavailableProviders, []);
  assert.equal(result.roundReadyAt, ANCHOR + 3 * 60_000);
}

{
  const result = select(
    [
      request("/qodo review", 1),
      limitSignal("qodo-code-review[bot]", 2, "Quota exceeded for reviews.", "Bot", 4),
      request("@codex review", 3),
    ],
    [review("chatgpt-codex-connector[bot]", 5)],
    6,
  );
  assert.equal(result.provider, "Codex");
  assert.equal(result.mode, "automatic-failover");
  assert.deepEqual(result.unavailableProviders, ["Qodo"]);
}

{
  const result = select(
    [
      request("/qodo review", 1),
      request("@codex review", 2),
      limitSignal("qodo-code-review[bot]", 3, "Quota exceeded for reviews."),
    ],
    [],
    5,
  );
  assert.equal(result.provider, null);
  assert.equal(result.mode, "fallback-pending");
  assert.equal(result.primaryFailure, "PROVIDER_LIMIT");
}

{
  const result = select(
    [
      request("/qodo review", 1),
      request("@codex review", 2),
      limitSignal("chatgpt-codex-connector[bot]", 3, "Quota exceeded for reviews."),
    ],
    [review("chatgpt-codex-connector[bot]", 4)],
    5,
  );
  assert.equal(result.provider, null);
  assert.equal(result.mode, "fallback-pending");
  assert.deepEqual(result.unavailableProviders, ["Codex"]);
}

{
  const result = select(
    [
      request("/qodo review", 1),
      request("@codex review", 2),
      limitSignal("chatgpt-codex-connector[bot]", 3, "Quota exceeded for reviews."),
    ],
    [
      review("chatgpt-codex-connector[bot]", 4),
      review("qodo-code-review", 5),
    ],
    6,
  );
  assert.equal(result.provider, "Qodo");
  assert.equal(result.mode, "primary");
}

{
  const result = select(
    [
      request("/qodo review", 1),
      request("@codex review", 2),
      limitSignal("qodo-code-review[bot]", -60, "Review limit reached.", "Bot", 3),
    ],
    [review("chatgpt-codex-connector[bot]", 4)],
    5,
  );
  assert.equal(result.provider, "Codex");
  assert.equal(result.mode, "automatic-failover");
}

{
  const result = select(
    [
      limitSignal("qodo-code-review[bot]", 1),
      request("/qodo review", 2),
      request("@codex review", 2),
    ],
    [review("chatgpt-codex-connector[bot]", 3)],
    4,
  );
  assert.equal(result.provider, null);
  assert.deepEqual(result.unavailableProviders, []);
}

{
  const result = select(
    [
      request("/qodo review", 1),
      request("@codex review", 2),
      limitSignal("qodo-code-review[bot]", 3, "Review limit reached.", "User"),
    ],
    [review("chatgpt-codex-connector[bot]", 4)],
    5,
  );
  assert.equal(result.provider, null);
  assert.equal(result.mode, "pending");
  assert.deepEqual(result.unavailableProviders, []);
}

{
  const result = select(
    [
      request("/qodo review", 1),
      request("@codex review", 2),
      limitSignal("qodo-code-review[bot]", 3, "No review limit reached; review can continue."),
    ],
    [review("chatgpt-codex-connector[bot]", 4)],
    5,
  );
  assert.equal(result.provider, null);
  assert.equal(result.mode, "pending");
  assert.deepEqual(result.unavailableProviders, []);
}

{
  const result = select(
    [
      request("/qodo review", 1),
      request("@codex review", 2),
      limitSignal("qodo-code-review[bot]", 3, "> Review limit reached\nNo current capacity issue."),
    ],
    [review("chatgpt-codex-connector[bot]", 4)],
    5,
  );
  assert.equal(result.provider, null);
  assert.equal(result.mode, "pending");
  assert.deepEqual(result.unavailableProviders, []);
}

{
  const dormantComments = [
    request("/qodo review", 1),
    request("@coderabbitai review", 2),
    limitSignal("coderabbitai[bot]", 3),
  ];
  const result = select(dormantComments, [review("coderabbitai[bot]", 4)], 5);
  assert.equal(result.provider, null);
  assert.equal(result.mode, "pending");
  assert.equal(result.warmStandbyRoundReady, false);
  assert.deepEqual(result.requestedProviders, ["Qodo"]);
  assert.deepEqual(result.unavailableProviders, []);
}

{
  const result = select(
    [
      request("/qodo review", 1),
      request("@codex review", 2),
      request("@coderabbitai review", 2),
      limitSignal("coderabbitai[bot]", 3),
      limitSignal("qodo-code-review[bot]", 3, "Quota exceeded for reviews."),
    ],
    [
      review("coderabbitai[bot]", 4),
      review("chatgpt-codex-connector[bot]", 5),
    ],
    6,
  );
  assert.equal(result.provider, "Codex");
  assert.equal(result.mode, "automatic-failover");
  assert.deepEqual(result.unavailableProviders, ["Qodo"]);
  assert.deepEqual(result.requestedProviders, ["Qodo", "Codex"]);
}

{
  const result = select(
    [
      request("/qodo review", 1),
      request("/qodo review", 16),
      request("@codex review", 2, "NONE"),
    ],
    [review("chatgpt-codex-connector[bot]", 18)],
    31,
  );
  assert.equal(result.provider, null);
  assert.equal(result.mode, "pending");
  assert.equal(result.warmStandbyRoundReady, false);
}

{
  const base = [
    request("/qodo review", 1),
    request("/qodo review", 16),
    request("@codex review", 2),
  ];
  const evil = select(base, [review("chatgpt-codex-connector-evil", 18)], 31);
  const dismissed = select(base, [review("chatgpt-codex-connector[bot]", 18, "DISMISSED")], 31);
  const stale = select(base, [review("chatgpt-codex-connector[bot]", 18, "COMMENTED", OLD_HEAD)], 31);
  const human = select(base, [review("chatgpt-codex-connector[bot]", 18, "COMMENTED", HEAD, "User")], 31);
  assert.equal(evil.mode, "fallback-pending");
  assert.equal(dismissed.mode, "fallback-pending");
  assert.equal(stale.mode, "fallback-pending");
  assert.equal(human.mode, "fallback-pending");
}

console.log("provider-pool contract: ok");
