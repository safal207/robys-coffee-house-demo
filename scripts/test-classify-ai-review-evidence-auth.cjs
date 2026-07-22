const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const classify = require("./classify-ai-review-evidence.cjs");

const HEAD = "a".repeat(40);
const HEAD_AT = "2026-07-04T00:00:00.000Z";
const REQUEST_AT = "2026-07-04T00:01:00.000Z";
const REVIEW_AT = "2026-07-04T00:02:00.000Z";

const runCase = async ({ association = "OWNER", reviews = [] }) => {
  const comments = [
    {
      body: "@codex review",
      author_association: association,
      created_at: REQUEST_AT,
    },
    {
      body: "@coderabbitai review",
      author_association: association,
      created_at: REQUEST_AT,
    },
  ];
  const listComments = () => {};
  const listReviews = () => {};
  const github = {
    rest: {
      issues: { listComments },
      pulls: { listReviews },
    },
    async paginate(endpoint) {
      return endpoint === listComments ? comments : reviews;
    },
  };
  const context = {
    repo: { owner: "safal207", repo: "robys-coffee-house-demo" },
    payload: {
      pull_request: {
        number: 157,
        updated_at: "2026-07-04T00:10:00.000Z",
        head: { sha: HEAD },
      },
    },
  };
  const summary = {
    addHeading() { return this; },
    addRaw() { return this; },
    addTable() { return this; },
    async write() { return this; },
  };
  const core = {
    summary,
    setFailed() {},
    notice() {},
    info() {},
  };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-review-auth-"));
  const resultPath = path.join(directory, "result.json");

  try {
    await classify({
      github,
      context,
      core,
      pollAttempts: 1,
      pollIntervalMs: 0,
      resultPath,
      headCommittedAt: HEAD_AT,
    });
    return JSON.parse(fs.readFileSync(resultPath, "utf8"));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
};

(async () => {
  const maintainerReviews = [
    {
      user: { login: "safal207" },
      commit_id: HEAD,
      submitted_at: REVIEW_AT,
    },
    {
      user: { login: "another-maintainer" },
      commit_id: HEAD,
      submitted_at: REVIEW_AT,
    },
  ];
  const maintainerResult = await runCase({ reviews: maintainerReviews });
  assert.equal(
    maintainerResult.classification,
    "PROVIDER_EVIDENCE_UNAVAILABLE",
  );
  assert.equal(maintainerResult.providers.codex.evidenceDetected, false);
  assert.equal(maintainerResult.providers.codeRabbit.evidenceDetected, false);

  const untrustedResult = await runCase({ association: "CONTRIBUTOR" });
  assert.equal(untrustedResult.classification, "REQUEST_MISSING");

  process.stdout.write("AI review evidence authority: 2 cases passed\n");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
