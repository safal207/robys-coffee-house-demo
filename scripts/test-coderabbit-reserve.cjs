"use strict";

const assert = require("node:assert/strict");
const reserve = require("./coderabbit-reserve.cjs")._test;

const HEAD = "a".repeat(40);
const NOW = Date.parse("2026-07-18T10:00:00Z"); // 13:00 Europe/Istanbul
const HEAD_AT = "2026-07-18T07:00:00Z";
const CODEX_REQUEST_AT = "2026-07-18T08:00:00Z";

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
    created_at: CODEX_REQUEST_AT,
    updated_at: CODEX_REQUEST_AT,
    author_association: "OWNER",
    user: { login: "safal207", type: "User" },
    ...overrides,
  };
}

function codexRequest(overrides = {}) {
  return comment(`@codex review\nExact head: ${HEAD}`, overrides);
}

function codexReview(overrides = {}) {
  return {
    body: "Clean review",
    state: "COMMENTED",
    submitted_at: "2026-07-18T08:30:00Z",
    commit_id: HEAD,
    user: { login: "chatgpt-codex-connector[bot]", type: "Bot" },
    ...overrides,
  };
}

function rabbitReview(overrides = {}) {
  return {
    body: "Clean review",
    state: "COMMENTED",
    submitted_at: "2026-07-18T09:30:00Z",
    commit_id: HEAD,
    user: { login: "coderabbitai[bot]", type: "Bot" },
    ...overrides,
  };
}

function reserveRequest(createdAt = "2026-07-18T06:00:00Z") {
  return comment(
    `${reserve.RESERVE_MARKER}\n@coderabbitai review\n\nExact head: ${HEAD}`,
    {
      created_at: createdAt,
      updated_at: createdAt,
      author_association: "NONE",
      user: { login: "github-actions[bot]", type: "Bot" },
    },
  );
}

function evaluate({ comments = [codexRequest()], reviews = [], nowMs = NOW, pullValue = pull() } = {}) {
  return reserve.evaluateCandidate({
    pull: pullValue,
    comments,
    reviews,
    headCommit: headCommit(),
    nowMs,
  });
}

assert.equal(reserve.TIME_ZONE, "Europe/Istanbul");
assert.equal(reserve.CODEX_WAIT_MS, 45 * 60 * 1000);
assert.equal(reserve.MAX_REQUESTS_PER_RUN, 1);
assert.equal(reserve.MAX_REQUESTS_PER_LOCAL_DAY, 3);
assert.equal(reserve.localDateKey(NOW), "2026-07-18");

const eligible = evaluate();
assert.equal(eligible.eligible, true);
assert.equal(eligible.reason, "CODEX_MISSING_AFTER_WAIT");

const noCodex = evaluate({ comments: [] });
assert.equal(noCodex.eligible, false);
assert.equal(noCodex.reason, "NO_CODEX_REQUEST");

const codexComplete = evaluate({ comments: [codexRequest()], reviews: [codexReview()] });
assert.equal(codexComplete.eligible, false);
assert.equal(codexComplete.reason, "CODEX_COMPLETE");

const codexCompleteBeforeDuplicateRequest = evaluate({
  comments: [
    codexRequest(),
    codexRequest({ created_at: "2026-07-18T09:30:00Z", updated_at: "2026-07-18T09:30:00Z" }),
  ],
  reviews: [codexReview()],
});
assert.equal(codexCompleteBeforeDuplicateRequest.eligible, false);
assert.equal(codexCompleteBeforeDuplicateRequest.reason, "CODEX_COMPLETE");

const tooSoon = evaluate({
  comments: [codexRequest({ created_at: "2026-07-18T09:30:00Z", updated_at: "2026-07-18T09:30:00Z" })],
});
assert.equal(tooSoon.eligible, false);
assert.equal(tooSoon.reason, "CODEX_WAIT");

const rabbitComplete = evaluate({ comments: [codexRequest()], reviews: [rabbitReview()] });
assert.equal(rabbitComplete.eligible, false);
assert.equal(rabbitComplete.reason, "CODERABBIT_COMPLETE");

const cooldown = evaluate({ comments: [codexRequest(), reserveRequest("2026-07-18T09:00:00Z")] });
assert.equal(cooldown.eligible, false);
assert.equal(cooldown.reason, "RESERVE_COOLDOWN");

const dailyCap = evaluate({
  comments: [
    codexRequest(),
    reserveRequest("2026-07-18T06:00:00Z"),
    reserveRequest("2026-07-18T06:10:00Z"),
    reserveRequest("2026-07-18T06:20:00Z"),
  ],
});
assert.equal(dailyCap.eligible, false);
assert.equal(dailyCap.reason, "DAILY_HEAD_CAP");

const limitCooldown = evaluate({
  comments: [
    codexRequest(),
    reserveRequest("2026-07-18T06:00:00Z"),
    comment("Review limit reached. Next review available in 2 hours.", {
      created_at: "2026-07-18T09:15:00Z",
      updated_at: "2026-07-18T09:15:00Z",
      author_association: "NONE",
      user: { login: "coderabbitai[bot]", type: "Bot" },
    }),
  ],
});
assert.equal(limitCooldown.eligible, false);
assert.equal(limitCooldown.reason, "PROVIDER_LIMIT_COOLDOWN");

const qodoNoise = evaluate({
  comments: [
    codexRequest(),
    comment(`/qodo review\nExact head: ${HEAD}`, {
      user: { login: "safal207", type: "User" },
    }),
  ],
});
assert.equal(qodoNoise.eligible, true);

const body = reserve.requestBody({ head: HEAD, windowLabel: "13:00" });
assert(body.includes(reserve.RESERVE_MARKER));
assert(body.includes("@coderabbitai review"));
assert(body.includes(`Exact head: ${HEAD}`));
assert(body.includes("13:00 Europe/Istanbul"));
assert(body.includes("cannot replace or satisfy Codex"));

console.log("✅ CODERABBIT-RESERVE-001 passed: bounded 09:00/13:00/19:00 Istanbul reserve requests activate only after Codex remains unavailable.");
