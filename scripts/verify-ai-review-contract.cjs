"use strict";

const TRUSTED_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const CODEX_LOGINS = new Set([
  "chatgpt-codex-connector[bot]",
  "chatgpt-codex-connector",
]);
const AI_REVIEW_WORKFLOW_NAME = "AI review contract";
const CODEX_COMMAND = "@codex review";
const POLL_ATTEMPTS = 45;
const POLL_INTERVAL_MS = 20_000;
const DORMANT_PROVIDER_NAMES = new Set(["Qodo"]);
const RESERVE_PROVIDER_NAMES = new Set(["CodeRabbit"]);

function parseTime(value) {
  if (typeof value !== "string" || value.trim() === "") return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createdTimeOf(item) {
  return parseTime(item?.created_at);
}

function submittedTimeOf(item) {
  return parseTime(item?.submitted_at);
}

function commandLinesOf(item) {
  return String(item?.body ?? "")
    .toLowerCase()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function hasExactHeadBinding(item, currentHead) {
  return commandLinesOf(item).includes(`exact head: ${currentHead.toLowerCase()}`);
}

function isPermissionError(error) {
  const message = error?.message ?? "";
  if (error?.status === 401) return true;
  if (error?.status !== 403) return false;
  return !/rate limit|secondary rate|abuse detection/i.test(message);
}

function freshTrustedRequests(comments, currentHead, headUpdateAnchor) {
  return comments
    .filter(
      (item) =>
        TRUSTED_ASSOCIATIONS.has(item.author_association) &&
        createdTimeOf(item) >= headUpdateAnchor &&
        commandLinesOf(item).includes(CODEX_COMMAND) &&
        hasExactHeadBinding(item, currentHead),
    )
    .sort((left, right) => createdTimeOf(left) - createdTimeOf(right));
}

function reviewedCommitOf(item) {
  const native = String(item?.commit_id ?? "").trim().toLowerCase();
  if (/^[0-9a-f]{7,40}$/.test(native)) return native;

  const body = String(item?.body ?? "");
  const match = body.match(/reviewed\s+commit\s*:\s*[*_]*\s*`?([0-9a-f]{7,40})`?/i);
  return match?.[1]?.toLowerCase() ?? "";
}

function isExactHeadCommit(evidenceCommit, currentHead) {
  if (!evidenceCommit || evidenceCommit.length < 7) return false;
  return currentHead.toLowerCase().startsWith(evidenceCommit);
}

function isCodexBot(item) {
  return CODEX_LOGINS.has(item?.user?.login) && item?.user?.type === "Bot";
}

function isSubmittedReview(review) {
  return Boolean(review?.submitted_at) && review.state !== "PENDING" && review.state !== "DISMISSED";
}

function isFinalCodexCommentEvidence(item) {
  const body = String(item?.body ?? "");
  return (
    /here are some automated review suggestions for this pull request/i.test(body) ||
    /\bcodex review\s*:\s*(?:did(?:n't| not) find|found no|no)\b[^\n]{0,100}\b(?:issue|issues|problem|problems)\b/i.test(body) ||
    /\bcodex review\s*:\s*(?:complete|completed)\b/i.test(body)
  );
}

function exactHeadCodexEvidence({ comments, reviews, currentHead, requestAt }) {
  if (requestAt <= 0) return [];

  const nativeReviews = reviews.filter(
    (review) =>
      isCodexBot(review) &&
      isSubmittedReview(review) &&
      submittedTimeOf(review) >= requestAt &&
      isExactHeadCommit(reviewedCommitOf(review), currentHead),
  );

  // A pre-request comment must never become fresh merely because somebody edits it later.
  // Comment evidence is therefore bound to created_at, not updated_at. It must also carry
  // a completed-review shape; acknowledgements, progress, quota and error messages are not E4/E5.
  const botComments = comments.filter(
    (comment) =>
      isCodexBot(comment) &&
      createdTimeOf(comment) >= requestAt &&
      isFinalCodexCommentEvidence(comment) &&
      isExactHeadCommit(reviewedCommitOf(comment), currentHead),
  );

  return [...nativeReviews, ...botComments].sort((left, right) => {
    const leftTime = submittedTimeOf(left) || createdTimeOf(left);
    const rightTime = submittedTimeOf(right) || createdTimeOf(right);
    return leftTime - rightTime;
  });
}

function stableHeadUpdateAnchor(run, currentHead, currentRunId) {
  if (run.id !== currentRunId) return 0;
  if (run.name !== AI_REVIEW_WORKFLOW_NAME) return 0;
  if (run.event !== "pull_request") return 0;
  if (run.head_sha?.toLowerCase() !== currentHead) return 0;
  return parseTime(run.created_at);
}

function pullHeadMatches(pull, currentHead) {
  return pull?.head?.sha?.toLowerCase() === currentHead;
}

function selectRequiredEvidence({ comments, reviews, currentHead, headUpdateAnchor }) {
  const requests = freshTrustedRequests(comments, currentHead, headUpdateAnchor);
  const codexRequestAt = requests.length > 0 ? createdTimeOf(requests[0]) : 0;
  const evidence = exactHeadCodexEvidence({
    comments,
    reviews,
    currentHead,
    requestAt: codexRequestAt,
  });

  return {
    provider: evidence.length > 0 ? "Codex" : null,
    mode: evidence.length > 0 ? "codex-only" : "pending",
    review: evidence[0] ?? null,
    codexRequestAt,
    requestedProviders: codexRequestAt > 0 ? ["Codex"] : [],
    dormantProviders: [...DORMANT_PROVIDER_NAMES].sort(),
    reserveProviders: [...RESERVE_PROVIDER_NAMES].sort(),
  };
}

async function resolveStableHeadUpdateAnchor({ github, owner, repo, currentHead, currentRunId }) {
  const response = await github.rest.actions.getWorkflowRun({
    owner,
    repo,
    run_id: currentRunId,
  });
  const anchor = stableHeadUpdateAnchor(response.data, currentHead, currentRunId);
  if (anchor <= 0) {
    throw new Error("current AI review workflow run is not bound to the current pull-request head");
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

      const [livePull, comments, reviews] = await Promise.all([
        github.rest.pulls.get({ owner, repo, pull_number: pr.number }),
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

      if (!pullHeadMatches(livePull.data, currentHead)) {
        core.setFailed(
          `AI review workflow head ${pr.head.sha} is stale; current pull-request head is ${livePull.data?.head?.sha ?? "unknown"}. ` +
            "A new commit invalidates every earlier request, review and readiness decision.",
        );
        return;
      }

      selection = selectRequiredEvidence({ comments, reviews, currentHead, headUpdateAnchor });
    } catch (error) {
      lastApiError = error?.message ?? String(error);
      if (isPermissionError(error)) {
        core.setFailed(
          "AI review verifier lacks required workflow permissions. Grant actions: read, issues: read and pull-requests: read. " +
            `GitHub API error: ${lastApiError}`,
        );
        return;
      }
      core.warning(`Transient GitHub API error (${attempt}/${POLL_ATTEMPTS}): ${lastApiError}`);
    }

    if (selection?.provider) {
      await core.summary
        .addHeading("AI review contract")
        .addTable([
          [
            { data: "Required reviewer", header: true },
            { data: "Mode", header: true },
            { data: "Exact head", header: true },
            { data: "Disabled providers", header: true },
            { data: "Scheduled reserve", header: true },
          ],
          [
            selection.provider,
            selection.mode,
            "yes",
            selection.dormantProviders.join(", ") || "none",
            selection.reserveProviders.join(", ") || "none",
          ],
        ])
        .addRaw(
          `\nStable freshness anchor: GitHub-server created_at of workflow run ${context.runId} for head ${pr.head.sha}. ` +
            "The trusted request must contain separate `@codex review` and `Exact head: <full SHA>` lines after every head update. " +
            "Evidence must be published by the authenticated Codex bot after that request and bind to the current commit. " +
            "Qodo is disabled. CodeRabbit is an advisory scheduled reserve at 09:00, 13:00 and 19:00 Europe/Istanbul; it cannot open, block or satisfy this required gate.\n",
        )
        .write();
      core.notice(`Verified request-bound Codex review for ${pr.head.sha}.`);
      return;
    }

    core.info(
      `Waiting for Codex exact-head review evidence (${attempt}/${POLL_ATTEMPTS}); ` +
        `requested=${selection?.requestedProviders?.join(",") || "none"}; head=${pr.head.sha}`,
    );
    if (attempt < POLL_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  core.setFailed(
    "Require request-bound Codex exact-head review evidence. Post `@codex review` and `Exact head: <current full SHA>` on separate lines after every head update. " +
      "An authenticated submitted Codex review or canonical completed reviewed-commit comment published after that request may satisfy the lane. " +
      "Acknowledgement, progress, quota, failure and error comments never satisfy it. " +
      "Qodo is disabled. CodeRabbit is a scheduled advisory reserve and cannot satisfy or block this gate." +
      (lastApiError ? ` Last transient API error: ${lastApiError}` : ""),
  );
}

module.exports = verifyAiReviewContract;
module.exports._test = {
  ACTIVE_PROVIDER_NAMES: ["Codex"],
  AI_REVIEW_WORKFLOW_NAME,
  CODEX_COMMAND,
  DORMANT_PROVIDER_NAMES,
  RESERVE_PROVIDER_NAMES,
  commandLinesOf,
  exactHeadCodexEvidence,
  freshTrustedRequests,
  hasExactHeadBinding,
  isExactHeadCommit,
  isFinalCodexCommentEvidence,
  pullHeadMatches,
  reviewedCommitOf,
  selectRequiredEvidence,
  stableHeadUpdateAnchor,
};
