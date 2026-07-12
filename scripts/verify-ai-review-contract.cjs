"use strict";

const QODO_LOGINS = new Set(["qodo-code-review", "qodo-code-review[bot]"]);
const CODERABBIT_LOGINS = new Set(["coderabbitai[bot]", "coderabbitai"]);
const CODEX_LOGINS = new Set([
  "chatgpt-codex-connector[bot]",
  "chatgpt-codex-connector",
]);
const POLL_ATTEMPTS = 45;
const POLL_INTERVAL_MS = 20_000;

function parseTime(value) {
  if (typeof value !== "string" || value.trim() === "") return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

function isPermissionError(error) {
  const message = error?.message ?? "";
  if (error?.status === 401) return true;
  if (error?.status !== 403) return false;
  return !/rate limit|secondary rate|abuse detection/i.test(message);
}

function exactHeadReview(reviews, logins, currentHead, headUpdateAnchor) {
  return reviews.find(
    (review) =>
      logins.has(review.user?.login) &&
      review.user?.type === "Bot" &&
      review.commit_id?.toLowerCase() === currentHead &&
      isSubmittedActiveReview(review) &&
      submittedTimeOf(review) >= headUpdateAnchor,
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

      const reviews = await github.paginate(github.rest.pulls.listReviews, {
        owner,
        repo,
        pull_number: pr.number,
        per_page: 100,
      });

      qodoReview = exactHeadReview(reviews, QODO_LOGINS, currentHead, headUpdateAnchor);
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
          "AI review verifier lacks required workflow permissions. Grant actions: read and pull-requests: read. " +
            `GitHub API error: ${lastApiError}`,
        );
        return;
      }
      core.warning(
        `Transient GitHub API error (${attempt}/${POLL_ATTEMPTS}): ${lastApiError}`,
      );
    }

    if (qodoReview) {
      await core.summary
        .addHeading("AI review contract")
        .addTable([
          [
            { data: "Lane", header: true },
            { data: "Evidence", header: true },
            { data: "Exact head", header: true },
          ],
          ["Qodo (required)", "native submitted pull-request review", "yes"],
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
            "Pending, dismissed, stale-head, non-bot and pre-anchor reviews do not count.\n",
        )
        .write();
      core.notice(
        `Verified native Qodo evidence for ${pr.head.sha}: submitted exact-head pull-request review.`,
      );
      return;
    }

    core.info(
      `Waiting for native Qodo evidence (${attempt}/${POLL_ATTEMPTS}); ` +
        `review=${Boolean(qodoReview)}; head=${pr.head.sha}`,
    );
    if (attempt < POLL_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  core.setFailed(
    "Require a native Qodo review submitted by qodo-code-review for the same exact head after the immutable workflow-run freshness anchor. " +
      "CodeRabbit and Codex are supplemental and cannot satisfy the required lane." +
      (lastApiError ? ` Last transient API error: ${lastApiError}` : ""),
  );
};
