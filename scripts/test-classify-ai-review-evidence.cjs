const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const classify = require("./classify-ai-review-evidence.cjs");

const HEAD = "a".repeat(40);
const UPDATED_AT = "2026-07-04T00:00:00.000Z";
const REQUEST_AT = "2026-07-04T00:01:00.000Z";
const REVIEW_AT = "2026-07-04T00:02:00.000Z";

const request = (body) => ({
  body,
  author_association: "OWNER",
  created_at: REQUEST_AT,
  updated_at: REQUEST_AT,
});

const review = (
  login,
  commitId = HEAD,
  submittedAt = REVIEW_AT,
  updatedAt = REVIEW_AT,
) => ({
  user: { login },
  commit_id: commitId,
  submitted_at: submittedAt,
  updated_at: updatedAt,
});

const makeCore = () => {
  const state = {
    failed: null,
    notices: [],
    infos: [],
  };
  const summary = {
    addHeading() { return this; },
    addRaw() { return this; },
    addTable() { return this; },
    async write() { return this; },
  };
  return {
    state,
    summary,
    setFailed(message) { state.failed = message; },
    notice(message) { state.notices.push(message); },
    info(message) { state.infos.push(message); },
  };
};

const runCase = async ({ comments, reviews }) => {
  const listComments = () => {};
  const listReviews = () => {};
  const github = {
    rest: {
      issues: { listComments },
      pulls: { listReviews },
    },
    async paginate(endpoint) {
      if (endpoint === listComments) return comments;
      if (endpoint === listReviews) return reviews;
      throw new Error("Unexpected endpoint");
    },
  };
  const context = {
    repo: { owner: "safal207", repo: "robys-coffee-house-demo" },
    payload: {
      pull_request: {
        number: 157,
        updated_at: UPDATED_AT,
        head: { sha: HEAD },
      },
    },
  };
  const core = makeCore();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-review-contract-"));
  const resultPath = path.join(directory, "result.json");

  await classify({
    github,
    context,
    core,
    pollAttempts: 1,
    pollIntervalMs: 0,
    resultPath,
  });

  const result = JSON.parse(fs.readFileSync(resultPath, "utf8"));
  fs.rmSync(directory, { recursive: true, force: true });
  return { result, core };
};

(async () => {
  {
    const { result, core } = await runCase({ comments: [], reviews: [] });
    assert.equal(result.classification, "REQUEST_MISSING");
    assert.match(core.state.failed, /^REQUEST_MISSING:/);
  }

  {
    const comments = [
      request("@codex review"),
      request("@coderabbitai review"),
    ];
    const { result, core } = await runCase({ comments, reviews: [] });
    assert.equal(result.classification, "PROVIDER_EVIDENCE_UNAVAILABLE");
    assert.match(core.state.failed, /^PROVIDER_EVIDENCE_UNAVAILABLE:/);
    assert.equal(result.providers.codex.requestDetected, true);
    assert.equal(result.providers.codeRabbit.requestDetected, true);
  }

  {
    const comments = [
      request("@codex review"),
      request("@coderabbitai review"),
    ];
    const reviews = [
      review("chatgpt-codex-connector[bot]"),
      review("coderabbitai[bot]"),
    ];
    const { result, core } = await runCase({ comments, reviews });
    assert.equal(result.classification, "VERIFIED");
    assert.equal(core.state.failed, null);
    assert.equal(result.providers.codex.reviewCommitSha, HEAD);
    assert.equal(result.providers.codeRabbit.reviewCommitSha, HEAD);
  }

  {
    const comments = [
      request("@codex review"),
      request("@coderabbitai review"),
    ];
    const reviews = [
      review("chatgpt-codex-connector[bot]", "b".repeat(40)),
      review("coderabbitai[bot]", "b".repeat(40)),
    ];
    const { result } = await runCase({ comments, reviews });
    assert.equal(result.classification, "PROVIDER_EVIDENCE_UNAVAILABLE");
    assert.equal(result.providers.codex.evidenceDetected, false);
    assert.equal(result.providers.codeRabbit.evidenceDetected, false);
  }

  {
    const staleCreatedAt = "2026-07-03T23:59:00.000Z";
    const comments = [
      {
        ...request("@codex review"),
        created_at: staleCreatedAt,
        updated_at: REQUEST_AT,
      },
      {
        ...request("@coderabbitai review"),
        created_at: staleCreatedAt,
        updated_at: REQUEST_AT,
      },
    ];
    const { result } = await runCase({ comments, reviews: [] });
    assert.equal(result.classification, "REQUEST_MISSING");
  }

  {
    const comments = [
      request("@codex review"),
      request("@coderabbitai review"),
    ];
    const staleSubmittedAt = "2026-07-04T00:00:30.000Z";
    const reviews = [
      review(
        "chatgpt-codex-connector[bot]",
        HEAD,
        staleSubmittedAt,
        REVIEW_AT,
      ),
      review(
        "coderabbitai[bot]",
        HEAD,
        staleSubmittedAt,
        REVIEW_AT,
      ),
    ];
    const { result } = await runCase({ comments, reviews });
    assert.equal(result.classification, "PROVIDER_EVIDENCE_UNAVAILABLE");
  }

  process.stdout.write("AI review evidence classifier: 6 cases passed\n");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
