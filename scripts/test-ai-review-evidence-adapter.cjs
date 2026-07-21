"use strict";

const assert = require("node:assert/strict");
const verifyAiReviewEvidenceAdapter = require("./verify-ai-review-evidence-adapter.cjs");
const adapter = verifyAiReviewEvidenceAdapter._test;

const head = "1234567890abcdef1234567890abcdef12345678";
const otherHead = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const anchorIso = "2026-07-21T06:20:00Z";
const anchor = Date.parse(anchorIso);
const requestAt = "2026-07-21T06:21:00Z";
const updatedAt = "2026-07-21T06:22:00Z";
const runId = 77;

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

function limitSignal(overrides = {}) {
  return walkthrough({
    body:
      "<!-- review_stack_entry_start -->\n" +
      `Reviewing files changed between ${otherHead} and ${head}.\n` +
      "Review limit reached. Next review available in 38 minutes.",
    ...overrides,
  });
}

function workflowRun(overrides = {}) {
  return {
    id: runId,
    name: "AI review contract",
    event: "pull_request",
    head_sha: head,
    created_at: anchorIso,
    ...overrides,
  };
}

function context() {
  return {
    repo: { owner: "safal207", repo: "robys-coffee-house-demo" },
    runId,
    payload: {
      pull_request: {
        number: 227,
        head: { sha: head },
      },
    },
  };
}

function coreMock() {
  const calls = {
    errors: [],
    failures: [],
    notices: [],
    warnings: [],
    summaryWrites: 0,
  };
  const summary = {
    addHeading() { return this; },
    addTable() { return this; },
    addRaw() { return this; },
    async write() { calls.summaryWrites += 1; },
  };
  return {
    calls,
    summary,
    error(message) { calls.errors.push(String(message)); },
    notice(message) { calls.notices.push(String(message)); },
    warning(message) { calls.warnings.push(String(message)); },
    setFailed(message) { calls.failures.push(String(message)); },
  };
}

function githubMock({ run = workflowRun(), liveHead = head, comments = [], runError = null } = {}) {
  return {
    rest: {
      actions: {
        async getWorkflowRun() {
          if (runError) throw runError;
          return { data: run };
        },
      },
      pulls: {
        async get() { return { data: { head: { sha: liveHead } } }; },
      },
      issues: {
        listComments() {},
      },
    },
    async paginate() { return comments; },
  };
}

function assertSelectionSemantics() {
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
    comments: [request(), limitSignal()],
    currentHead: head,
    headUpdateAnchor: anchor,
  });
  assert.equal(quotaBody, null, "a quota response must never become clean walkthrough evidence");

  const acceptedLimit = adapter.selectStableLimitEvidence({
    comments: [request(), limitSignal()],
    currentHead: head,
    headUpdateAnchor: anchor,
  });
  assert(acceptedLimit, "an updated authenticated exact-head quota response must activate the narrow waiver");

  const staleLimit = adapter.selectStableLimitEvidence({
    comments: [request(), limitSignal({ updated_at: "2026-07-21T06:20:30Z" })],
    currentHead: head,
    headUpdateAnchor: anchor,
  });
  assert.equal(staleLimit, null, "a quota observation before the latest request must not waive the lane");

  const wrongHeadLimit = adapter.selectStableLimitEvidence({
    comments: [request(), limitSignal({ body: `Review limit reached. Reviewed ${otherHead}.` })],
    currentHead: head,
    headUpdateAnchor: anchor,
  });
  assert.equal(wrongHeadLimit, null, "a quota response must include the full current head");

  const negativeLimit = adapter.selectStableLimitEvidence({
    comments: [request(), limitSignal({ body: `No review limit was reached for ${head}.` })],
    currentHead: head,
    headUpdateAnchor: anchor,
  });
  assert.equal(negativeLimit, null, "a negative limit phrase must not activate a waiver");

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
}

function assertAnchorSemantics() {
  assert.equal(adapter.stableHeadUpdateAnchor(workflowRun(), head, runId), anchor);
  assert.equal(adapter.stableHeadUpdateAnchor(workflowRun({ id: runId + 1 }), head, runId), 0);
  assert.equal(adapter.stableHeadUpdateAnchor(workflowRun({ name: "other" }), head, runId), 0);
  assert.equal(adapter.stableHeadUpdateAnchor(workflowRun({ event: "push" }), head, runId), 0);
  assert.equal(adapter.stableHeadUpdateAnchor(workflowRun({ head_sha: otherHead }), head, runId), 0);
}

async function assertIntegrationSemantics() {
  {
    const core = coreMock();
    let legacyCalls = 0;
    await verifyAiReviewEvidenceAdapter({
      github: githubMock({ comments: [request(), walkthrough()] }),
      context: context(),
      core,
      legacyVerifierFn: async () => { legacyCalls += 1; },
    });
    assert.equal(legacyCalls, 0, "walkthrough success must not invoke the legacy verifier");
    assert.equal(core.calls.failures.length, 0);
    assert.equal(core.calls.summaryWrites, 1);
    assert.equal(core.calls.notices.length, 1);
  }

  {
    const core = coreMock();
    let legacyCalls = 0;
    await verifyAiReviewEvidenceAdapter({
      github: githubMock({ comments: [request(), limitSignal()] }),
      context: context(),
      core,
      legacyVerifierFn: async () => { legacyCalls += 1; },
    });
    assert.equal(legacyCalls, 0, "an exact-head provider-limit signal must use the narrow adapter waiver");
    assert.equal(core.calls.failures.length, 0);
    assert.equal(core.calls.summaryWrites, 1);
    assert.equal(core.calls.warnings.length, 1);
  }

  {
    const core = coreMock();
    let legacyCalls = 0;
    await verifyAiReviewEvidenceAdapter({
      github: githubMock({ run: workflowRun({ id: runId + 1 }) }),
      context: context(),
      core,
      legacyVerifierFn: async () => { legacyCalls += 1; },
    });
    assert.equal(legacyCalls, 0, "invalid workflow binding must fail closed without fallback");
    assert.equal(core.calls.failures.length, 1);
    assert.match(core.calls.failures[0], /not bound/);
  }

  {
    const core = coreMock();
    let legacyCalls = 0;
    await verifyAiReviewEvidenceAdapter({
      github: githubMock({ liveHead: otherHead, comments: [request(), walkthrough()] }),
      context: context(),
      core,
      legacyVerifierFn: async () => { legacyCalls += 1; },
    });
    assert.equal(legacyCalls, 0, "stale PR head must fail closed without fallback");
    assert.equal(core.calls.failures.length, 1);
    assert.match(core.calls.failures[0], /stale/);
  }

  {
    const core = coreMock();
    let legacyCalls = 0;
    await verifyAiReviewEvidenceAdapter({
      github: githubMock({ comments: [request()] }),
      context: context(),
      core,
      legacyVerifierFn: async () => { legacyCalls += 1; },
    });
    assert.equal(legacyCalls, 1, "missing walkthrough and limit evidence must invoke the legacy verifier");
    assert.equal(core.calls.errors.length, 0, "normal evidence absence is not an adapter error");
  }

  {
    const core = coreMock();
    let legacyCalls = 0;
    await verifyAiReviewEvidenceAdapter({
      github: githubMock({ runError: new Error("network exploded") }),
      context: context(),
      core,
      legacyVerifierFn: async () => { legacyCalls += 1; },
    });
    assert.equal(legacyCalls, 1, "unexpected adapter errors must preserve the legacy fallback");
    assert.equal(core.calls.errors.length, 1, "unexpected adapter errors must be prominent");
    assert.match(core.calls.errors[0], /network exploded/);
  }
}

(async () => {
  assertSelectionSemantics();
  assertAnchorSemantics();
  await assertIntegrationSemantics();
  console.log(
    "✅ AI-REVIEW-ADAPTER-001 passed: stable walkthrough and exact-head quota selection, negative workflow anchors, stale-head fail-closed behavior, normal legacy fallback, and prominent unexpected-error fallback are covered.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
