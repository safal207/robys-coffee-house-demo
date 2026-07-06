"use strict";

const TRUSTED_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const CODERABBIT_LOGINS = new Set(["coderabbitai[bot]", "coderabbitai"]);
const CODEX_LOGINS = new Set([
  "chatgpt-codex-connector[bot]",
  "chatgpt-codex-connector",
]);
const CODERABBIT_STATUS_CONTEXT = "CodeRabbit";
const POLL_ATTEMPTS = 45;
const POLL_INTERVAL_MS = 20_000;

function parseTime(value) {
  const parsed = Date.parse(value ?? 0);
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

function latestCreatedTime(items) {
  return items.reduce(
    (latest, item) => Math.max(latest, createdTimeOf(item)),
    0,
  );
}

function isPermissionError(error) {
  const message = error?.message ?? "";
  if (error?.status === 401) return true;
  if (error?.status !== 403) return false;
  return !/rate limit|secondary rate|abuse detection/i.test(message);
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
        headUpdateAnchor = parseTime(run.data.created_at);
        if (headUpdateAnchor <= 0) {
          throw new Error("workflow run has no immutable creation timestamp");
        }
      }

      const [comments, reviews, statuses] = await Promise.all([
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
        github.paginate(github.rest.repos.listCommitStatusesForRef, {
          owner,
          repo,
          ref: currentHead,
          per_page: 100,
        }),
      ]);

      const freshRequest = (item, command) =>
        TRUSTED_ASSOCIATIONS.has(item.author_association) &&
        createdTimeOf(item) >= headUpdateAnchor &&
        commandLinesOf(item).includes(command);

      codeRabbitRequestAt = latestCreatedTime(
        comments.filter((item) => freshRequest(item, "@coderabbitai review")),
      );
      const codexRequestAt = latestCreatedTime(
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
          status.context === CODERABBIT_STATUS_CONTEXT &&
          status.state === "success" &&
          CODERABBIT_LOGINS.has(status.creator?.login) &&
          codeRabbitRequestAt > 0 &&
          createdTimeOf(status) >= codeRabbitRequestAt,
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
      lastApiError = error?.message ?? String(error);
      if (isPermissionError(error)) {
        core.setFailed(
          "AI review verifier lacks required workflow permissions. Grant actions: read, issues: read, pull-requests: read, and statuses: read. " +
            `GitHub API error: ${lastApiError}`,
        );
        return;
      }
      core.warning(
        `Transient GitHub API error (${attempt}/${POLL_ATTEMPTS}): ${lastApiError}`,
      );
    }

    if (codeRabbitRequestAt > 0 && (codeRabbitReview || codeRabbitStatus)) {
      const evidenceType = codeRabbitReview
        ? "submitted exact-head pull-request review"
        : "successful exact-head commit status after the request";
      await core.summary
        .addHeading("AI review contract")
        .addTable([
          [
            { data: "Lane", header: true },
            { data: "Evidence", header: true },
            { data: "Exact head", header: true },
          ],
          ["CodeRabbit (required)", evidenceType, "yes"],
          [
            "Codex (supplemental)",
            nativeCodexReview ? "native submitted review" : "not counted",
            nativeCodexReview ? "yes" : "n/a",
          ],
        ])
        .addRaw(
          `\nFreshness anchor: workflow run ${context.runId}; head ${pr.head.sha}. ` +
            "Edited requests, pending/dismissed reviews, summaries, and older-head evidence do not count.\n",
        )
        .write();
      core.notice(
        `Verified native CodeRabbit evidence for ${pr.head.sha}: ${evidenceType}.`,
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
    "Require a trusted @coderabbitai review request created after the immutable head-update anchor and native CodeRabbit evidence for that same head after the request: either a submitted active review or a successful bot-authored CodeRabbit commit status." +
      (lastApiError ? ` Last transient API error: ${lastApiError}` : ""),
  );
};
