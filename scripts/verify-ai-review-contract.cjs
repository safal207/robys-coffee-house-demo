"use strict";

const TRUSTED_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const CODERABBIT_LOGINS = new Set(["coderabbitai[bot]", "coderabbitai"]);
const CODEX_LOGINS = new Set([
  "chatgpt-codex-connector[bot]",
  "chatgpt-codex-connector",
]);
const POLL_ATTEMPTS = 45;
const POLL_INTERVAL_MS = 20_000;

function timeOf(item) {
  const parsed = Date.parse(
    item.submitted_at ?? item.updated_at ?? item.created_at ?? 0,
  );
  return Number.isFinite(parsed) ? parsed : 0;
}

function submittedTimeOf(review) {
  const parsed = Date.parse(review.submitted_at ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isSubmittedActiveReview(review) {
  return (
    Boolean(review.submitted_at) &&
    review.state !== "PENDING" &&
    review.state !== "DISMISSED"
  );
}

function commandLinesOf(item) {
  return (item.body ?? "")
    .toLowerCase()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function containsExactHead(item, head) {
  return new RegExp(`(^|[^0-9a-f])${head}([^0-9a-f]|$)`, "i").test(
    item.body ?? "",
  );
}

function latestTime(items) {
  return items.reduce((latest, item) => Math.max(latest, timeOf(item)), 0);
}

module.exports = async function verifyAiReviewContract({ github, context, core }) {
  const { owner, repo } = context.repo;
  const pr = context.payload.pull_request;
  const currentHead = pr.head.sha.toLowerCase();
  let headUpdateAnchor = 0;

  for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
    let codeRabbitRequestAt = 0;
    let codeRabbitReview;
    let codeRabbitStatus;
    let nativeCodexReview;

    try {
      if (headUpdateAnchor <= 0) {
        const run = await github.rest.actions.getWorkflowRun({
          owner,
          repo,
          run_id: context.runId,
        });
        headUpdateAnchor = Date.parse(run.data.created_at ?? 0);
        if (!Number.isFinite(headUpdateAnchor) || headUpdateAnchor <= 0) {
          headUpdateAnchor = 0;
          throw new Error("workflow run has no immutable creation time");
        }
      }

      const [comments, reviews, statuses] = await Promise.all([
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
        github.paginate(github.rest.repos.listCommitStatusesForRef, {
          owner,
          repo,
          ref: currentHead,
          per_page: 100,
        }),
      ]);

      const freshRequest = (item, command) =>
        TRUSTED_ASSOCIATIONS.has(item.author_association) &&
        timeOf(item) >= headUpdateAnchor &&
        commandLinesOf(item).includes(command) &&
        containsExactHead(item, currentHead);

      codeRabbitRequestAt = latestTime(
        comments.filter((item) => freshRequest(item, "@coderabbitai review")),
      );
      const codexRequestAt = latestTime(
        comments.filter((item) => freshRequest(item, "@codex review")),
      );

      codeRabbitReview = reviews.find(
        (review) =>
          CODERABBIT_LOGINS.has(review.user?.login) &&
          review.commit_id?.toLowerCase() === currentHead &&
          isSubmittedActiveReview(review) &&
          codeRabbitRequestAt > 0 &&
          submittedTimeOf(review) >= codeRabbitRequestAt,
      );

      codeRabbitStatus = statuses.find(
        (status) =>
          status.context === "CodeRabbit" &&
          status.state === "success" &&
          CODERABBIT_LOGINS.has(status.creator?.login) &&
          codeRabbitRequestAt > 0 &&
          timeOf(status) >= headUpdateAnchor,
      );

      nativeCodexReview = reviews.find(
        (review) =>
          CODEX_LOGINS.has(review.user?.login) &&
          review.commit_id?.toLowerCase() === currentHead &&
          isSubmittedActiveReview(review) &&
          codexRequestAt > 0 &&
          submittedTimeOf(review) >= codexRequestAt,
      );
    } catch (error) {
      core.warning(
        `Transient GitHub API error (${attempt}/${POLL_ATTEMPTS}): ${error.message}`,
      );
    }

    if (codeRabbitRequestAt > 0 && (codeRabbitReview || codeRabbitStatus)) {
      const evidenceType = codeRabbitReview
        ? "submitted pull-request review object"
        : "trusted exact-head commit status";
      core.notice(
        `Verified native CodeRabbit evidence for ${pr.head.sha}: ${evidenceType}. ` +
          `Codex native evidence: ${Boolean(nativeCodexReview)}.`,
      );
      return;
    }

    core.info(
      `Waiting for native CodeRabbit evidence (${attempt}/${POLL_ATTEMPTS}); ` +
        `request=${codeRabbitRequestAt > 0}; review=${Boolean(codeRabbitReview)}; ` +
        `status=${Boolean(codeRabbitStatus)}; head=${pr.head.sha}`,
    );
    if (attempt < POLL_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  core.setFailed(
    "Require a fresh trusted exact-head CodeRabbit request and later native exact-head evidence: " +
      "either a submitted active PR review object or a trusted successful CodeRabbit commit status. " +
      "Pending, dismissed, summary-comment, generated-comment, and stale evidence never counts.",
  );
};
