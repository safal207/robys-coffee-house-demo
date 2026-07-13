"use strict";

const TRUSTED_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const QODO_LOGINS = new Set(["qodo-code-review", "qodo-code-review[bot]"]);
const CODERABBIT_LOGINS = new Set(["coderabbitai[bot]", "coderabbitai"]);
const CODEX_LOGINS = new Set([
  "chatgpt-codex-connector[bot]",
  "chatgpt-codex-connector",
]);
const QODO_COMMAND = "/qodo review";
const POLL_ATTEMPTS = 45;
const POLL_INTERVAL_MS = 20_000;

function parseTime(value) {
  if (typeof value !== "string" || value.trim() === "") return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createdTimeOf(item) {
  return parseTime(item.created_at);
}

function submittedTimeOf(review) {
  return parseTime(review.submitted_at);
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

function isPermissionError(error) {
  const message = error?.message ?? "";
  if (error?.status === 401) return true;
  if (error?.status !== 403) return false;
  return !/rate limit|secondary rate|abuse detection/i.test(message);
}

function exactHeadReview(reviews, logins, currentHead, notBefore) {
  return reviews.find(
    (review) =>
      logins.has(review.user?.login) &&
      review.user?.type === "Bot" &&
      review.commit_id?.toLowerCase() === currentHead &&
      isSubmittedActiveReview(review) &&
      submittedTimeOf(review) >= notBefore,
  );
}

module.exports = async function verifyAiReviewContract({ github, context, core }) {
  const { owner, repo } = context.repo;
  const pr = context.payload.pull_request;
  if (!pr?.head?.sha) {
    core.setFailed("AI review verifier requires a pull_request event with a head SHA.");
    return;
  }

  const currentHead = pr.head.sha.toLowerCase();
  let headUpdateAnchor = 0;
  let lastApiError = "";

  for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
    let qodoRequestAt = 0;
    let qodoReview;
    let codeRabbitReview;
    let nativeCodexReview;

    try {
      if (headUpdateAnchor <= 0) {
        const run = await github.rest.actions.getWorkflowRun({
          owner,
          repo,
          run_id: context.runId,
        });
        headUpdateAnchor = parseTime(run.data.created_at);
        if (headUpdateAnchor <= 0) {
          throw new Error("workflow run has no immutable creation timestamp");
        }
      }

      const [comments, reviews] = await Promise.all([
        github.paginate(github.rest.issues.listComments, {
          owner,
          repo,
          issue_number: pr.number,
          since: new Date(headUpdateAnchor).toISOString(),
          per_page: 100,
        }),
        github.paginate(github.rest.pulls.listReviews, {
          owner,
          repo,
          pull_number: pr.number,
          per_page: 100,
        }),
      ]);

      qodoRequestAt = comments
        .filter(
          (item) =>
            TRUSTED_ASSOCIATIONS.has(item.author_association) &&
            createdTimeOf(item) >= headUpdateAnchor &&
            commandLinesOf(item).includes(QODO_COMMAND),
        )
        .reduce((latest, item) => Math.max(latest, createdTimeOf(item)), 0);

      const qodoReviewAnchor = Math.max(headUpdateAnchor, qodoRequestAt);
      qodoReview = qodoRequestAt > 0
        ? exactHeadReview(reviews, QODO_LOGINS, currentHead, qodoReviewAnchor)
        : undefined;
      codeRabbitReview = exactHeadReview(
        reviews,
        CODERABBIT_LOGINS,
        currentHead,
        headUpdateAnchor,
      );
      nativeCodexReview = exactHeadReview(
        reviews,
        CODEX_LOGINS,
        currentHead,
        headUpdateAnchor,
      );
    } catch (error) {
      lastApiError = error?.message ?? String(error);
      if (isPermissionError(error)) {
        core.setFailed(
          "AI review verifier lacks required workflow permissions. Grant actions: read, issues: read, and pull-requests: read. " +
            `GitHub API error: ${lastApiError}`,
        );
        return;
      }
      core.warning(
        `Transient GitHub API error (${attempt}/${POLL_ATTEMPTS}): ${lastApiError}`,
      );
    }

    if (qodoRequestAt > 0 && qodoReview) {
      await core.summary
        .addHeading("AI review contract")
        .addTable([
          [
            { data: "Lane", header: true },
            { data: "Evidence", header: true },
            { data: "Exact head", header: true },
          ],
          [
            "Qodo (required)",
            "trusted request followed by native submitted pull-request review",
            "yes",
          ],
          [
            "CodeRabbit (supplemental)",
            codeRabbitReview ? "native submitted review" : "not counted",
            codeRabbitReview ? "yes" : "n/a",
          ],
          [
            "Codex (supplemental)",
            nativeCodexReview ? "native submitted review" : "not counted",
            nativeCodexReview ? "yes" : "n/a",
          ],
        ])
        .addRaw(
          `\nFreshness anchor: workflow run ${context.runId}; head ${pr.head.sha}. ` +
            "The trusted /qodo review approval must be created after the immutable workflow-run anchor, and the native Qodo Bot review must be submitted after that trusted request for the same exact head. " +
            "Pending, dismissed, stale-head, non-bot, pre-anchor and pre-request evidence does not count.\n",
        )
        .write();
      core.notice(
        `Verified request-bound Qodo review for ${pr.head.sha}; request_at=${new Date(qodoRequestAt).toISOString()}.`,
      );
      return;
    }

    core.info(
      `Waiting for trusted Qodo evidence (${attempt}/${POLL_ATTEMPTS}); ` +
        `request=${qodoRequestAt > 0}; request_bound_review=${Boolean(qodoReview)}; head=${pr.head.sha}`,
    );
    if (attempt < POLL_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  core.setFailed(
    "Require a trusted /qodo review approval comment created after the immutable workflow-run freshness anchor and a native Qodo Bot review submitted after that trusted request for the same exact head. " +
      "CodeRabbit and Codex are supplemental and cannot satisfy the required lane." +
      (lastApiError ? ` Last transient API error: ${lastApiError}` : ""),
  );
};
