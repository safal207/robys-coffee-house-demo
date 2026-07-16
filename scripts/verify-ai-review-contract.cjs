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
const LIMIT_SIGNAL_PATTERNS = [
  /review limit reached/i,
  /rate limit(?:ed| reached| exceeded)?/i,
  /quota (?:has been )?(?:reached|exceeded|exhausted)/i,
  /usage limit (?:has been )?(?:reached|exceeded|exhausted)/i,
  /next review available in/i,
  /temporarily unavailable[^\n]*(?:limit|quota)/i,
];

const PROVIDERS = [
  { name: "Qodo", command: QODO_COMMAND, logins: QODO_LOGINS },
  { name: "Codex", command: CODEX_COMMAND, logins: CODEX_LOGINS },
  { name: "CodeRabbit", command: CODERABBIT_COMMAND, logins: CODERABBIT_LOGINS },
];

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

function signalTimeOf(item) {
  return Math.max(parseTime(item.created_at), parseTime(item.updated_at));
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

function providerLimitSignals(comments, logins, notBefore) {
  if (notBefore <= 0) return [];
  return comments
    .filter((item) => {
      if (!logins.has(item.user?.login)) return false;
      if (item.user?.type !== "Bot") return false;
      if (signalTimeOf(item) < notBefore) return false;
      const body = item.body ?? "";
      return LIMIT_SIGNAL_PATTERNS.some((pattern) => pattern.test(body));
    })
    .sort((left, right) => signalTimeOf(left) - signalTimeOf(right));
}

function stableHeadUpdateAnchor(run, currentHead, currentRunId) {
  if (run.id !== currentRunId) return 0;
  if (run.name !== AI_REVIEW_WORKFLOW_NAME) return 0;
  if (run.event !== "pull_request") return 0;
  if (run.head_sha?.toLowerCase() !== currentHead) return 0;
  return parseTime(run.created_at);
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

function collectProviderState({ comments, reviews, currentHead, headUpdateAnchor }) {
  return PROVIDERS.map((provider) => {
    const requests = freshTrustedRequests(
      comments,
      provider.command,
      currentHead,
      headUpdateAnchor,
    );
    const requestAt = firstRequestAt(requests);
    const review = requestAt > 0
      ? exactHeadReviews(reviews, provider.logins, currentHead, requestAt)[0]
      : undefined;
    const limitSignal = requestAt > 0
      ? providerLimitSignals(comments, provider.logins, requestAt)[0]
      : undefined;
    return { ...provider, requests, requestAt, review, limitSignal };
  });
}

function selectRequiredEvidence({ comments, reviews, currentHead, headUpdateAnchor, now }) {
  const states = collectProviderState({
    comments,
    reviews,
    currentHead,
    headUpdateAnchor,
  });
  const qodo = states.find((state) => state.name === "Qodo");
  const unavailableProviders = states
    .filter((state) => state.limitSignal)
    .map((state) => state.name)
    .sort();

  if (qodo.review) {
    return {
      provider: "Qodo",
      mode: "primary",
      primaryFailure: "none",
      review: qodo.review,
      qodoRequestAt: qodo.requestAt,
      fallbackEligible: false,
      unavailableProviders,
    };
  }

  const timeoutPair = qodoTimeoutPair(qodo.requests);
  const fallbackEligibleAt = timeoutPair
    ? timeoutPair.secondAt + SECOND_QODO_TIMEOUT_MS
    : 0;
  const timeoutFallbackEligible = fallbackEligibleAt > 0 && now >= fallbackEligibleAt;
  const limitFallbackEligible = unavailableProviders.length > 0;
  const fallbackEligible = timeoutFallbackEligible || limitFallbackEligible;
  const primaryFailure = limitFallbackEligible ? "PROVIDER_LIMIT" :
    timeoutPair ? "QODO_TIMEOUT_2_PENDING" : "QODO_TIMEOUT_1_PENDING";

  if (!fallbackEligible) {
    return {
      provider: null,
      mode: "pending",
      primaryFailure,
      review: null,
      qodoRequestAt: qodo.requestAt,
      timeoutPair,
      fallbackEligible,
      fallbackEligibleAt,
      unavailableProviders,
    };
  }

  const candidates = states
    .filter((state) => state.name !== "Qodo" && state.review)
    .map((state) => ({
      provider: state.name,
      review: state.review,
      requestAt: state.requestAt,
    }))
    .sort((left, right) => {
      const timeDelta = submittedTimeOf(left.review) - submittedTimeOf(right.review);
      if (timeDelta !== 0) return timeDelta;
      return left.provider.localeCompare(right.provider);
    });

  if (candidates.length > 0) {
    return {
      ...candidates[0],
      mode: limitFallbackEligible ? "automatic-failover" : "fallback",
      primaryFailure: limitFallbackEligible ? "PROVIDER_LIMIT" : "QODO_TIMEOUT_2",
      qodoRequestAt: qodo.requestAt,
      timeoutPair,
      fallbackEligible,
      fallbackEligibleAt,
      unavailableProviders,
    };
  }

  return {
    provider: null,
    mode: "fallback-pending",
    primaryFailure: limitFallbackEligible ? "PROVIDER_LIMIT" : "QODO_TIMEOUT_2",
    review: null,
    qodoRequestAt: qodo.requestAt,
    timeoutPair,
    fallbackEligible,
    fallbackEligibleAt,
    unavailableProviders,
    requestedProviders: states.filter((state) => state.requestAt > 0).map((state) => state.name),
  };
}

async function resolveStableHeadUpdateAnchor({
  github,
  owner,
  repo,
  currentHead,
  currentRunId,
}) {
  const response = await github.rest.actions.getWorkflowRun({
    owner,
    repo,
    run_id: currentRunId,
  });
  const anchor = stableHeadUpdateAnchor(
    response.data,
    currentHead,
    currentRunId,
  );
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
            { data: "Unavailable providers", header: true },
          ],
          [
            selection.provider,
            selection.mode,
            "yes",
            selection.primaryFailure,
            selection.unavailableProviders?.join(", ") || "none",
          ],
        ])
        .addRaw(
          `\nStable freshness anchor: GitHub-server created_at of workflow run ${context.runId} for head ${pr.head.sha}. ` +
            "GitHub preserves the workflow run ID across rerun attempts. Every trusted request must contain an exact `Exact head: <SHA>` line. Qodo, Codex and CodeRabbit should be requested as warm standbys after each head update. Qodo remains primary, but an authenticated provider Bot rate-limit or quota signal immediately opens automatic failover to another request-bound native exact-head reviewer. " +
            "A limit signal is operational evidence only and never satisfies the review lane. Pending, dismissed, stale-head, non-bot, pre-anchor, unbound and pre-request evidence does not count.\n",
        )
        .write();
      core.notice(
        `Verified ${selection.mode} required review from ${selection.provider} for ${pr.head.sha}; primary_failure=${selection.primaryFailure}; unavailable=${selection.unavailableProviders?.join(",") || "none"}.`,
      );
      return;
    }

    core.info(
      `Waiting for independent review evidence (${attempt}/${POLL_ATTEMPTS}); ` +
        `mode=${selection?.mode ?? "unknown"}; primary_failure=${selection?.primaryFailure ?? "unknown"}; ` +
        `fallback_eligible=${Boolean(selection?.fallbackEligible)}; unavailable=${selection?.unavailableProviders?.join(",") || "none"}; head=${pr.head.sha}`,
    );
    if (attempt < POLL_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  core.setFailed(
    "Require request-bound native exact-head independent review evidence. Every trusted request must include `Exact head: <current full SHA>`. Request Qodo, Codex and CodeRabbit as warm standbys after every head update. " +
      "Qodo remains primary. An authenticated provider Bot rate-limit or quota signal immediately opens automatic failover to another requested provider; otherwise fallback opens after the existing two-request Qodo timeout sequence. " +
      "A limit notice, reaction, acknowledgement, status-only result, maintainer-authored proxy, unbound request, stale review, pending review, or dismissed review does not count as review evidence." +
      (lastApiError ? ` Last transient API error: ${lastApiError}` : ""),
  );
}

module.exports = verifyAiReviewContract;
module.exports._test = {
  AI_REVIEW_WORKFLOW_NAME,
  LIMIT_SIGNAL_PATTERNS,
  MIN_QODO_REQUEST_GAP_MS,
  SECOND_QODO_TIMEOUT_MS,
  commandLinesOf,
  exactHeadReviews,
  freshTrustedRequests,
  hasExactHeadBinding,
  providerLimitSignals,
  signalTimeOf,
  qodoTimeoutPair,
  selectRequiredEvidence,
  stableHeadUpdateAnchor,
};
