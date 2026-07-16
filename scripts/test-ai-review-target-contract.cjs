"use strict";

const assert = require("node:assert/strict");
const { _test } = require("./verify-ai-review-target-contract.cjs");

const BASE_SHA = "a".repeat(40);
const HEAD_SHA = "b".repeat(40);
const RUN_ID = 77;
const PR_NUMBER = 211;
const CREATED_AT = "2026-07-16T18:00:00Z";
const DISPLAY_TITLE = _test.expectedRunTitle(PR_NUMBER, HEAD_SHA);

function run(overrides = {}) {
  return {
    id: RUN_ID,
    name: "AI review contract",
    display_title: DISPLAY_TITLE,
    event: "pull_request_target",
    head_sha: BASE_SHA,
    path: ".github/workflows/ai-review-contract.yml@main",
    created_at: CREATED_AT,
    ...overrides,
  };
}

const stableArgs = {
  currentRunId: RUN_ID,
  trustedBaseSha: BASE_SHA,
  defaultBranch: "main",
  prNumber: PR_NUMBER,
  currentHead: HEAD_SHA,
};

const anchor = _test.stableTargetRunAnchor(run(), stableArgs);
assert.equal(anchor, Date.parse(CREATED_AT));
assert.equal(DISPLAY_TITLE, `AI review PR #${PR_NUMBER} head ${HEAD_SHA}`);

for (const invalid of [
  run({ id: 99 }),
  run({ name: "Other workflow" }),
  run({ display_title: `AI review PR #${PR_NUMBER} head ${BASE_SHA}` }),
  run({ display_title: `AI review PR #999 head ${HEAD_SHA}` }),
  run({ event: "pull_request" }),
  run({ head_sha: HEAD_SHA }),
  run({ path: ".github/workflows/ai-review-contract.yml@feature" }),
  run({ created_at: "" }),
]) {
  assert.equal(_test.stableTargetRunAnchor(invalid, stableArgs), 0);
}

const validContext = {
  eventName: "pull_request_target",
  sha: BASE_SHA,
  payload: {
    action: "synchronize",
    repository: { default_branch: "main" },
    pull_request: { number: PR_NUMBER, head: { sha: HEAD_SHA } },
  },
};
assert.equal(_test.targetContextError(validContext), "");
assert.match(
  _test.targetContextError({ ...validContext, eventName: "pull_request" }),
  /requires pull_request_target/,
);
assert.match(
  _test.targetContextError({ ...validContext, sha: HEAD_SHA.slice(0, 12) }),
  /trusted default-branch SHA/,
);
assert.match(
  _test.targetContextError({
    ...validContext,
    payload: { ...validContext.payload, action: "edited" },
  }),
  /unsupported pull_request_target action/,
);

console.log("trusted-target contract: ok");
