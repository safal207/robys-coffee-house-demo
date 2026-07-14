"use strict";

const TRUSTED_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const QODO_LOGINS = new Set(["qodo-code-review", "qodo-code-review[bot]"]);
const CODERABBIT_LOGINS = new Set(["coderabbitai[bot]", "coderabbitai"]);
const CODEX_LOGINS = new Set([
  "chatgpt-codex-connector[bot]",
  "chatgpt-codex-connector",
]);
const AI_REVIEW_WORKFLOW_NAME = "AI review contract";
const QODO_COMMAND = "/qodo review";
const CODERABBIT_COMMAND = "@coderabbitai review";
const CODEX_COMMAND = "@codex review";
const MIN_QODO_REQUEST_GAP_MS = 15 * 60 * 1000;
const SECOND_QODO_TIMEOUT_MS = 15 * 60 * 1000;
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

function hasExactHeadBinding(item, currentHead) {
  const expected = `exact head: ${currentHead.toLowerCase()}`;
  return commandLinesOf(item).includes(expected);
}

function isPermissionError(error) {
  const message = error?.message ?? "";
  if (error?.status === 401) return true;
  if (error?.status !== 403) return false;
  return !/rate limit|secondary rate|abuse detection/i.test(message);
}

function freshTrustedRequests(
  comments,
  command,
  currentHead,
  headUpdateAnchor,
  notBefore = 0,
) {
  return comments
    .filter(
      (item) =>
        TRUSTED_ASSOCIATIONS.has(item.author_association) &&
        createdTimeOf(item) >= Math.max(headUpdateAnchor, notBefore) &&
        commandLinesOf(item).includes(command) &&
        hasExactHeadBinding(item, currentHead),
    )
    .sort((left, right) => createdTimeOf(left) - createdTimeOf(right));
}

function exactHeadReviews(reviews, logins, currentHead, notBefore) {
  return reviews
    .filter(
      (review) =>
        logins.has(review.user?.login) &&
        review.user?.type === "Bot" &&
        review.commit_id?.toLowerCase() === currentHead &&
        isSubmittedActiveReview(review) &&
        submittedTimeOf(review) >= notBefore,
    )
    .sort((left, right) => submittedTimeOf(left) - submittedTimeOf(right));
}

function stableHeadUpdateAnchor(runs, currentHead, currentRunId) {
  const exactHeadRuns = runs.filter(
    (run) =>
      run.head_sha?.toLowerCase() === currentHead &&
      run.name === AI_REVIEW_WORKFLOW_NAME &&
      run.event === "pull_request",
  );
  const currentRunPresent = exactHeadRuns.some((run) => run.id === currentRunId);
  if (!currentRunPresent) return 0;

  const anchors = exactHeadRuns
    .map((run) => parseTime(run.created_at))
    .filter((value) => value > 0);

  return anchors.length > 0 ? Math.min(...anchors) : 0;
}

function qodoTimeoutPair(requests) {
  let selected;
  for (let secondIndex = 1; secondIndex < requests.length; secondIndex += 1) {
    const secondAt = createdTimeOf(requests[secondIndex]);
    for (let firstIndex = secondIndex - 1; firstIndex >= 0; firstIndex -= 1) {
      const firstAt = createdTimeOf(requests[firstIndex]);
      if (secondAt - firstAt >= MIN_QODO_REQUEST_GAP_MS) {
        selected = { firstAt, secondAt };
        break;
      }
    }
  }
  return selected;
}

function firstRequestAt(requests) {
  return requests.length > 0 ? createdTimeOf(requests[0]) : 0;
}

function selectRequiredEvidence({ comments, reviews, currentHead, headUpdateAnchor, now }) {
  const qodoRequests = freshTrustedRequests(
    comments,
    QODO_COMMAND,
    currentHead,
    headUpdateAnchor,
  );
  const qodoRequestAt = firstRequestAt(qodoRequests);
  const qodoReview = qodoRequestAt > 0
    ? exactHeadReviews(reviews, QODO_LOGINS, currentHead, qodoRequestAt)[0]
    : undefined;

  if (qodoReview) {
    return {
      provider: "Qodo",
      mode: "primary",
      primaryFailure: "none",
      review: qodoReview,
      qodoRequestAt,
      fallbackEligible: false,
    };
  }

  const timeoutPair = qodoTimeoutPair(qodoRequests);
  const fallbackEligibleAt = timeoutPair
    ? timeoutPair.secondAt + SECOND_QODO_TIMEOUT_MS
    : 0;
  const fallbackEligible = fallbackEligibleAt > 0 && now >= fallbackEligibleAt;

  if (!fallbackEligible) {
    return {
      provider: null,
      mode: "pending",
      primaryFailure: timeoutPair ? "QODO_TIMEOUT_2_PENDING" : "QODO_TIMEOUT_1_PENDING",
      review: null,
      qodoRequestAt,
      timeoutPair,
      fallbackEligible,
      fallbackEligibleAt,
    };
  }

  const codexRequests = freshTrustedRequests(
    comments,
    CODEX_COMMAND,
    currentHead,
    headUpdateAnchor,
    timeoutPair.secondAt,
  );
  const codeRabbitRequests = freshTrustedRequests(
    comments,
    CODERABBIT_COMMAND,
    currentHead,
    headUpdateAnchor,
    timeoutPair.secondAt,
  );
  const codexRequestAt = firstRequestAt(codexRequests);
  const codeRabbitRequestAt = firstRequestAt(codeRabbitRequests);
  const codexReview = codexRequestAt > 0
    ? exactHeadReviews(reviews, CODEX_LOGINS, currentHead, codexRequestAt)[0]
    : undefined;
  const codeRabbitReview = codeRabbitRequestAt > 0
    ? exactHeadReviews(reviews, CODERABBIT_LOGINS, currentHead, codeRabbitRequestAt)[0]
    : undefined;

  const candidates = [
    codexReview
      ? { provider: "Codex", review: codexReview, requestAt: codexRequestAt }
      : null,
    codeRabbitReview
      ? { provider: "CodeRabbit", review: codeRabbitReview, requestAt: codeRabbitRequestAt }
      : null,
  ]
    .filter(Boolean)
    .sort((left, right) => {
      const timeDelta = submittedTimeOf(left.review) - submittedTimeOf(right.review);
      if (timeDelta !== 0) return timeDelta;
      return left.provider.localeCompare(right.provider);
    });

  if (candidates.length > 0) {
    return {
      ...candidates[0],
      mode: "fallback",
      primaryFailure: "QODO_TIMEOUT_2",
      qodoRequestAt,
      timeoutPair,
      fallbackEligible,
      fallbackEligibleAt,
    };
  }

  return {
    provider: null,
    mode: "fallback-pending",
    primaryFailure: "QODO_TIMEOUT_2",
    review: null,
    qodoRequestAt,
    timeoutPair,
    fallbackEligible,
    fallbackEligibleAt,
    codexRequestAt,
    codeRabbitRequestAt,
  };
}

async function resolveStableHeadUpdateAnchor({
  github,
  owner,
  repo,
  currentHead,
  currentRunId,
}) {
  const [workflowRuns, currentRunResponse] = await Promise.all([
    github.paginate(github.rest.actions.listWorkflowRunsForRepo, {
      owner,
      repo,
      event: "pull_request",
      head_sha: currentHead,
      per_page: 100,
    }),
    github.rest.actions.getWorkflowRun({
      owner,
      repo,
      run_id: currentRunId,
    }),
  ]);

  const runs = [...workflowRuns, currentRunResponse.data];
  const anchor = stableHeadUpdateAnchor(runs, currentHead, currentRunId);
  if (anchor <= 0) {
    throw new Error("no immutable AI review workflow anchor exists for the current head");
  }
  return anchor;
}

async function verifyAiReviewContract({ github, context, core }) {
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
    let selection;

    try {
      if (headUpdateAnchor <= 0) {
        headUpdateAnchor = await resolveStableHeadUpdateAnchor({
          github,
          owner,
          repo,
          currentHead,
          currentRunId: context.runId,
        });
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

      selection = selectRequiredEvidence({
        comments,
        reviews,
        currentHead,
        headUpdateAnchor,
        now: Date.now(),
      });
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

    if (selection?.provider) {
      await core.summary
        .addHeading("AI review contract")
        .addTable([
          [
            { data: "Required reviewer", header: true },
            { data: "Mode", header: true },
            { data: "Exact head", header: true },
            { data: "Primary failure", header: true },
          ],
          [
            selection.provider,
            selection.mode,
            "yes",
            selection.primaryFailure,
          ],
        ])
        .addRaw(
          `\nStable freshness anchor: earliest ${AI_REVIEW_WORKFLOW_NAME} run in this repository for head ${pr.head.sha}. ` +
            "Every trusted request must contain an exact `Exact head: <SHA>` line. Qodo is primary. Fallback requires two trusted /qodo review requests at least 15 minutes apart, another 15 minutes after the second request, and a request-bound native exact-head Codex or CodeRabbit Bot review. " +
            "A failed run may be rerun after the timeout windows without losing request history. Pending, dismissed, stale-head, non-bot, pre-anchor, unbound and pre-request evidence does not count.\n",
        )
        .write();
      core.notice(
        `Verified ${selection.mode} required review from ${selection.provider} for ${pr.head.sha}; primary_failure=${selection.primaryFailure}.`,
      );
      return;
    }

    core.info(
      `Waiting for independent review evidence (${attempt}/${POLL_ATTEMPTS}); ` +
        `mode=${selection?.mode ?? "unknown"}; primary_failure=${selection?.primaryFailure ?? "unknown"}; ` +
        `fallback_eligible=${Boolean(selection?.fallbackEligible)}; head=${pr.head.sha}`,
    );
    if (attempt < POLL_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  core.setFailed(
    "Require request-bound native exact-head independent review evidence. Every trusted request must include `Exact head: <current full SHA>`. Qodo is primary. " +
      "Fallback opens only after two trusted /qodo review requests at least 15 minutes apart and 15 additional minutes after the second request; then a trusted @codex review or @coderabbitai review request must be followed by a native Bot review on the same exact head. " +
      "After the timeout windows, rerun the failed AI review contract; its stable exact-head server-side anchor preserves the earlier request history even when workflow pull-request metadata is empty. " +
      "A reaction, acknowledgement, status-only result, maintainer-authored proxy, unbound request, stale review, pending review, or dismissed review does not count." +
      (lastApiError ? ` Last transient API error: ${lastApiError}` : ""),
  );
}

module.exports = verifyAiReviewContract;
module.exports._test = {
  AI_REVIEW_WORKFLOW_NAME,
  MIN_QODO_REQUEST_GAP_MS,
  SECOND_QODO_TIMEOUT_MS,
  commandLinesOf,
  exactHeadReviews,
  freshTrustedRequests,
  hasExactHeadBinding,
  qodoTimeoutPair,
  selectRequiredEvidence,
  stableHeadUpdateAnchor,
};
