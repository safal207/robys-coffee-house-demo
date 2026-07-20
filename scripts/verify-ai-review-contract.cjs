"use strict";

const TRUSTED_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const CODERABBIT_LOGINS = new Set(["coderabbitai", "coderabbitai[bot]"]);
const AI_REVIEW_WORKFLOW_NAME = "AI review contract";
const CODERABBIT_COMMAND = "@coderabbitai review";
const CODERABBIT_MARKER = "<!-- coderabbit-reserve -->";
const POLL_ATTEMPTS = 45;
const POLL_INTERVAL_MS = 20_000;
const DORMANT_PROVIDER_NAMES = new Set(["Qodo"]);
const ADVISORY_PROVIDER_NAMES = new Set(["Codex", "DeepSeek"]);
const LIMIT_SIGNAL_PATTERNS = [
  /review limit reached/i,
  /rate limit (?:has been )?(?:reached|exceeded|exhausted)/i,
  /quota (?:has been )?(?:reached|exceeded|exhausted)/i,
  /usage limit (?:has been )?(?:reached|exceeded|exhausted)/i,
  /next review available in/i,
  /free tier[^\n]{0,80}limit/i,
];

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

function isTrustedRequiredRequest(item, currentHead, headUpdateAnchor) {
  if (createdTimeOf(item) < headUpdateAnchor) return false;
  if (!commandLinesOf(item).includes(CODERABBIT_COMMAND)) return false;
  if (!hasExactHeadBinding(item, currentHead)) return false;
  if (TRUSTED_ASSOCIATIONS.has(item.author_association)) return true;
  return item?.user?.login === "github-actions[bot]" && String(item?.body ?? "").includes(CODERABBIT_MARKER);
}

function freshRequiredRequests(comments, currentHead, headUpdateAnchor) {
  return comments
    .filter((item) => isTrustedRequiredRequest(item, currentHead, headUpdateAnchor))
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

function isCodeRabbitBot(item) {
  return CODERABBIT_LOGINS.has(item?.user?.login) && item?.user?.type === "Bot";
}

function isSubmittedReview(review) {
  return Boolean(review?.submitted_at) && review.state !== "PENDING" && review.state !== "DISMISSED";
}

function hasPositiveLimitSignal(body) {
  const text = String(body ?? "");
  if (/\b(?:no|not|without)\b[^\n.!?]{0,80}\b(?:rate limit|review limit|quota|usage limit)\b/i.test(text)) {
    return false;
  }
  return LIMIT_SIGNAL_PATTERNS.some((pattern) => pattern.test(text));
}

function isFinalCodeRabbitCommentEvidence(item) {
  const body = String(item?.body ?? "");
  if (hasPositiveLimitSignal(body)) return false;
  if (/\b(?:started|starting|queued|in progress|failed|failure|error|unavailable)\b/i.test(body)) return false;
  return (
    /\bcoderabbit(?:ai)? review\s*:\s*(?:complete|completed)\b/i.test(body) ||
    /\breview (?:is )?(?:complete|completed)\b/i.test(body) ||
    /\b(?:no|did(?:n't| not) find|found no)\b[^\n]{0,100}\b(?:issue|issues|problem|problems)\b/i.test(body)
  );
}

function exactHeadCodeRabbitEvidence({ comments, reviews, currentHead, requestAt }) {
  if (requestAt <= 0) return [];

  const nativeReviews = reviews.filter(
    (review) =>
      isCodeRabbitBot(review) &&
      isSubmittedReview(review) &&
      submittedTimeOf(review) >= requestAt &&
      isExactHeadCommit(reviewedCommitOf(review), currentHead),
  );

  const botComments = comments.filter(
    (comment) =>
      isCodeRabbitBot(comment) &&
      createdTimeOf(comment) >= requestAt &&
      isFinalCodeRabbitCommentEvidence(comment) &&
      isExactHeadCommit(reviewedCommitOf(comment), currentHead),
  );

  return [...nativeReviews, ...botComments].sort((left, right) => {
    const leftTime = submittedTimeOf(left) || createdTimeOf(left);
    const rightTime = submittedTimeOf(right) || createdTimeOf(right);
    return leftTime - rightTime;
  });
}

function latestCodeRabbitLimitSignal(comments, requestAt) {
  if (requestAt <= 0) return null;
  return comments
    .filter(
      (comment) =>
        isCodeRabbitBot(comment) &&
        createdTimeOf(comment) >= requestAt &&
        hasPositiveLimitSignal(comment.body),
    )
    .sort((left, right) => createdTimeOf(left) - createdTimeOf(right))
    .at(-1) ?? null;
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
  const requests = freshRequiredRequests(comments, currentHead, headUpdateAnchor);
  const earliestRequestAt = requests.length > 0 ? createdTimeOf(requests[0]) : 0;
  const latestRequestAt = requests.length > 0 ? createdTimeOf(requests.at(-1)) : 0;
  const evidence = exactHeadCodeRabbitEvidence({
    comments,
    reviews,
    currentHead,
    requestAt: earliestRequestAt,
  });
  const limitSignal = evidence.length === 0
    ? latestCodeRabbitLimitSignal(comments, latestRequestAt)
    : null;

  if (evidence.length > 0) {
    return {
      provider: "CodeRabbit",
      mode: "coderabbit-required",
      review: evidence[0],
      providerLimitWaived: false,
      requestAt: earliestRequestAt,
      requestedProviders: ["CodeRabbit"],
      dormantProviders: [...DORMANT_PROVIDER_NAMES].sort(),
      advisoryProviders: [...ADVISORY_PROVIDER_NAMES].sort(),
    };
  }

  if (limitSignal) {
    return {
      provider: "CodeRabbit",
      mode: "provider-limit-bypass",
      review: limitSignal,
      providerLimitWaived: true,
      requestAt: latestRequestAt,
      requestedProviders: ["CodeRabbit"],
      dormantProviders: [...DORMANT_PROVIDER_NAMES].sort(),
      advisoryProviders: [...ADVISORY_PROVIDER_NAMES].sort(),
    };
  }

  return {
    provider: null,
    mode: "pending",
    review: null,
    providerLimitWaived: false,
    requestAt: latestRequestAt,
    requestedProviders: latestRequestAt > 0 ? ["CodeRabbit"] : [],
    dormantProviders: [...DORMANT_PROVIDER_NAMES].sort(),
    advisoryProviders: [...ADVISORY_PROVIDER_NAMES].sort(),
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
            { data: "Provider-limit waiver", header: true },
            { data: "Advisory providers", header: true },
          ],
          [
            selection.provider,
            selection.mode,
            selection.providerLimitWaived ? "request-bound" : "yes",
            selection.providerLimitWaived ? "yes" : "no",
            selection.advisoryProviders.join(", ") || "none",
          ],
        ])
        .addRaw(
          `\nStable freshness anchor: GitHub-server created_at of workflow run ${context.runId} for head ${pr.head.sha}. ` +
            "The trusted request must contain separate `@coderabbitai review` and `Exact head: <full SHA>` lines after every head update. " +
            "A submitted exact-head CodeRabbit review satisfies the gate. A positive authenticated CodeRabbit limit/quota signal published after the latest trusted request activates the documented provider-limit bypass. " +
            "Silence, progress, generic failure, third-party comments and stale signals never satisfy or waive the gate. Codex and DeepSeek are advisory; Qodo is disabled.\n",
        )
        .write();
      if (selection.providerLimitWaived) {
        core.warning(`CodeRabbit provider-limit waiver verified for ${pr.head.sha}; human approval, CI, cooperation report and D6 remain mandatory.`);
      } else {
        core.notice(`Verified request-bound CodeRabbit review for ${pr.head.sha}.`);
      }
      return;
    }

    core.info(
      `Waiting for CodeRabbit exact-head review or explicit limit signal (${attempt}/${POLL_ATTEMPTS}); ` +
        `requested=${selection?.requestedProviders?.join(",") || "none"}; head=${pr.head.sha}`,
    );
    if (attempt < POLL_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  core.setFailed(
    "Require request-bound CodeRabbit exact-head review evidence or an explicit authenticated provider-limit signal. " +
      "Post `@coderabbitai review` and `Exact head: <current full SHA>` on separate lines after every head update. " +
      "A submitted exact-head CodeRabbit review may satisfy the lane; a positive CodeRabbit limit/quota response after the latest trusted request may waive only the external AI-review step. " +
      "Silence, progress, generic failure, error and stale comments never satisfy or waive it. Codex and DeepSeek are advisory; Qodo is disabled." +
      (lastApiError ? ` Last transient API error: ${lastApiError}` : ""),
  );
}

module.exports = verifyAiReviewContract;
module.exports._test = {
  ACTIVE_PROVIDER_NAMES: ["CodeRabbit"],
  ADVISORY_PROVIDER_NAMES,
  AI_REVIEW_WORKFLOW_NAME,
  CODERABBIT_COMMAND,
  CODERABBIT_MARKER,
  DORMANT_PROVIDER_NAMES,
  commandLinesOf,
  exactHeadCodeRabbitEvidence,
  freshRequiredRequests,
  hasExactHeadBinding,
  hasPositiveLimitSignal,
  isExactHeadCommit,
  isFinalCodeRabbitCommentEvidence,
  latestCodeRabbitLimitSignal,
  pullHeadMatches,
  reviewedCommitOf,
  selectRequiredEvidence,
  stableHeadUpdateAnchor,
};
