"use strict";

const TRUSTED_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const CODERABBIT_LOGINS = new Set(["coderabbitai[bot]", "coderabbitai"]);
const POLL_ATTEMPTS = 30;
const POLL_INTERVAL_MS = 20_000;

function immutableTimeOf(item) {
  const parsed = Date.parse(item.submitted_at ?? item.created_at ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function bodyOf(item) {
  return (item.body ?? "").trim();
}

function commandLinesOf(item) {
  return bodyOf(item)
    .toLowerCase()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function bodyContainsExactSha(item, sha) {
  return new RegExp(`(^|[^0-9a-f])${sha}([^0-9a-f]|$)`, "i").test(bodyOf(item));
}

function isFreshReviewRequest(item, currentHead, headUpdateAnchor) {
  return (
    TRUSTED_ASSOCIATIONS.has(item.author_association) &&
    immutableTimeOf(item) >= headUpdateAnchor &&
    commandLinesOf(item).includes("@coderabbitai review") &&
    bodyContainsExactSha(item, currentHead)
  );
}

function latestRequestAt(requests) {
  return requests.reduce(
    (latest, request) => Math.max(latest, immutableTimeOf(request)),
    0,
  );
}

module.exports = async function verifyAiReviewContract({ github, context, core }) {
  const owner = context.repo.owner;
  const repo = context.repo.repo;
  const pr = context.payload.pull_request;
  const currentHead = pr.head.sha.toLowerCase();

  const workflowRun = await github.rest.actions.getWorkflowRun({
    owner,
    repo,
    run_id: context.runId,
  });
  const headUpdateAnchor = Date.parse(workflowRun.data.created_at ?? 0);
  if (!Number.isFinite(headUpdateAnchor) || headUpdateAnchor <= 0) {
    core.setFailed("Unable to determine the immutable current-head workflow anchor.");
    return;
  }

  for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
    const [comments, reviews] = await Promise.all([
      github.paginate(github.rest.issues.listComments, {
        owner,
        repo,
        issue_number: pr.number,
        per_page: 100,
      }),
      github.paginate(github.rest.pulls.listReviews, {
        owner,
        repo,
        pull_number: pr.number,
        per_page: 100,
      }),
    ]);

    const requests = comments.filter((comment) =>
      isFreshReviewRequest(comment, currentHead, headUpdateAnchor),
    );
    const requestAt = latestRequestAt(requests);
    const exactHeadReview = reviews.find((review) =>
      CODERABBIT_LOGINS.has(review.user?.login) &&
      review.commit_id?.toLowerCase() === currentHead &&
      requestAt > 0 &&
      immutableTimeOf(review) >= requestAt,
    );

    if (requestAt > 0 && exactHeadReview) {
      core.notice(`Verified native CodeRabbit PR review for exact head ${pr.head.sha}.`);
      return;
    }

    core.info(
      `Waiting for exact-head CodeRabbit PR review (${attempt}/${POLL_ATTEMPTS}); ` +
      `request=${requestAt > 0}, review=${Boolean(exactHeadReview)}, head=${pr.head.sha}`,
    );
    if (attempt < POLL_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  core.setFailed(
    "Post a fresh trusted @coderabbitai review request containing the full current SHA, then require a CodeRabbit-authored pull-request review object whose commit_id equals that SHA. Comments and generated summaries never satisfy this gate.",
  );
};
