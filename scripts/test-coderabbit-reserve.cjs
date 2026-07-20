"use strict";

const assert = require("node:assert/strict");
const scheduler = require("./coderabbit-reserve.cjs")._test;

const HEAD = "a".repeat(40);
const NOW = Date.parse("2026-07-20T10:00:00Z"); // 13:00 Europe/Istanbul
const HEAD_AT = "2026-07-20T05:00:00Z";
const REQUEST_AT = "2026-07-20T08:00:00Z";

function pull(overrides = {}) {
  return {
    number: 213,
    state: "open",
    merged_at: null,
    draft: false,
    head: { sha: HEAD },
    ...overrides,
  };
}

function headCommit(date = HEAD_AT) {
  return { commit: { committer: { date } } };
}

function comment(body, overrides = {}) {
  return {
    body,
    created_at: REQUEST_AT,
    updated_at: REQUEST_AT,
    author_association: "OWNER",
    user: { login: "safal207", type: "User" },
    ...overrides,
  };
}

function manualRequest(createdAt = REQUEST_AT) {
  return comment(`@coderabbitai review\nExact head: ${HEAD}`, {
    created_at: createdAt,
    updated_at: createdAt,
  });
}

function actionRequest(createdAt = REQUEST_AT) {
  return comment(`${scheduler.REQUEST_MARKER}\n@coderabbitai review\n\nExact head: ${HEAD}`, {
    created_at: createdAt,
    updated_at: createdAt,
    author_association: "NONE",
    user: { login: "github-actions[bot]", type: "Bot" },
  });
}

function rabbitReview(overrides = {}) {
  return {
    body: "Clean review",
    state: "COMMENTED",
    submitted_at: "2026-07-20T08:30:00Z",
    commit_id: HEAD,
    user: { login: "coderabbitai[bot]", type: "Bot" },
    ...overrides,
  };
}

function rabbitComment(body = `CodeRabbit Review: completed.\n\nReviewed commit: \`${HEAD.slice(0, 10)}\``, overrides = {}) {
  return comment(body, {
    created_at: "2026-07-20T08:30:00Z",
    updated_at: "2026-07-20T08:30:00Z",
    author_association: "NONE",
    user: { login: "coderabbitai[bot]", type: "Bot" },
    ...overrides,
  });
}

function evaluate({ comments = [], reviews = [], nowMs = NOW, pullValue = pull(), headDate = HEAD_AT } = {}) {
  return scheduler.evaluateCandidate({
    pull: pullValue,
    comments,
    reviews,
    headCommit: headCommit(headDate),
    nowMs,
  });
}

assert.equal(scheduler.TIME_ZONE, "Europe/Istanbul");
assert.equal(scheduler.INITIAL_WAIT_MS, 45 * 60 * 1000);
assert.equal(scheduler.MAX_REQUESTS_PER_RUN, 1);
assert.equal(scheduler.MAX_REQUESTS_PER_LOCAL_DAY, 3);
assert.equal(scheduler.localDateKey(NOW), "2026-07-20");

const initial = evaluate();
assert.equal(initial.eligible, true);
assert.equal(initial.reason, "INITIAL_REQUIRED_REQUEST");

const headWait = evaluate({ headDate: "2026-07-20T09:30:00Z" });
assert.equal(headWait.eligible, false);
assert.equal(headWait.reason, "HEAD_WAIT");

const manualCooldown = evaluate({ comments: [manualRequest("2026-07-20T09:00:00Z")] });
assert.equal(manualCooldown.eligible, false);
assert.equal(manualCooldown.reason, "REQUEST_COOLDOWN");

const actionCooldown = evaluate({ comments: [actionRequest("2026-07-20T09:00:00Z")] });
assert.equal(actionCooldown.eligible, false);
assert.equal(actionCooldown.reason, "REQUEST_COOLDOWN");

const nativeComplete = evaluate({ comments: [manualRequest()], reviews: [rabbitReview()] });
assert.equal(nativeComplete.eligible, false);
assert.equal(nativeComplete.reason, "CODERABBIT_COMPLETE");

const commentComplete = evaluate({ comments: [manualRequest(), rabbitComment()] });
assert.equal(commentComplete.eligible, false);
assert.equal(commentComplete.reason, "CODERABBIT_COMPLETE");

for (const body of [
  "CodeRabbit review started and is in progress.",
  "CodeRabbit review failed because the provider is unavailable.",
  "Generic provider error.",
]) {
  const retry = evaluate({
    comments: [manualRequest("2026-07-20T06:00:00Z"), rabbitComment(body, { created_at: "2026-07-20T06:30:00Z" })],
  });
  assert.equal(retry.eligible, true, `${body} must not count as final evidence or quota waiver`);
  assert.equal(retry.reason, "RETRY_REQUIRED_REQUEST");
}

const limitWaived = evaluate({
  comments: [
    manualRequest("2026-07-20T06:00:00Z"),
    rabbitComment("Review limit reached. Next review available in 2 hours.", {
      created_at: "2026-07-20T06:30:00Z",
    }),
  ],
});
assert.equal(limitWaived.eligible, false);
assert.equal(limitWaived.reason, "PROVIDER_LIMIT_WAIVED");

const negativeLimit = evaluate({
  comments: [
    manualRequest("2026-07-20T06:00:00Z"),
    rabbitComment("No review limit was reached; review is starting.", {
      created_at: "2026-07-20T06:30:00Z",
    }),
  ],
});
assert.equal(negativeLimit.eligible, true);
assert.equal(negativeLimit.reason, "RETRY_REQUIRED_REQUEST");

const staleLimitBeforeLatestRequest = evaluate({
  comments: [
    manualRequest("2026-07-20T05:00:00Z"),
    rabbitComment("Review limit reached.", { created_at: "2026-07-20T05:30:00Z" }),
    manualRequest("2026-07-20T09:00:00Z"),
  ],
});
assert.equal(staleLimitBeforeLatestRequest.eligible, false);
assert.equal(staleLimitBeforeLatestRequest.reason, "REQUEST_COOLDOWN");

const dailyCap = evaluate({
  comments: [
    actionRequest("2026-07-20T05:00:00Z"),
    actionRequest("2026-07-20T05:10:00Z"),
    actionRequest("2026-07-20T05:20:00Z"),
  ],
});
assert.equal(dailyCap.eligible, false);
assert.equal(dailyCap.reason, "DAILY_HEAD_CAP");

const staleHeadRequest = evaluate({
  comments: [comment(`@coderabbitai review\nExact head: ${"b".repeat(40)}`)],
});
assert.equal(staleHeadRequest.eligible, true);
assert.equal(staleHeadRequest.reason, "INITIAL_REQUIRED_REQUEST");

const untrustedRequest = evaluate({
  comments: [manualRequest(REQUEST_AT), comment(`@coderabbitai review\nExact head: ${HEAD}`, {
    author_association: "NONE",
    user: { login: "random-user", type: "User" },
  })],
});
assert.equal(untrustedRequest.eligible, false);
assert.equal(untrustedRequest.reason, "REQUEST_COOLDOWN");

const body = scheduler.requestBody({ head: HEAD, windowLabel: "13:00" });
assert(body.includes(scheduler.REQUEST_MARKER));
assert(body.includes("@coderabbitai review"));
assert(body.includes(`Exact head: ${HEAD}`));
assert(body.includes("13:00 Europe/Istanbul"));
assert(body.includes("provider-limit waiver"));
assert(body.includes("Human approval, CI, dispositions and D6 remain mandatory"));

console.log("✅ CODERABBIT-REQUIRED-001 passed: scheduled windows create bounded required-review requests, final evidence stops retries, and only an explicit post-request limit/quota signal activates the narrow waiver.");
