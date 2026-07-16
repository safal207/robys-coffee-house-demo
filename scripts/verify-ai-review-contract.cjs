"use strict";

const TRUSTED_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const QODO_LOGINS = new Set(["qodo-code-review", "qodo-code-review[bot]"]);
const CODEX_LOGINS = new Set([
  "chatgpt-codex-connector[bot]",
  "chatgpt-codex-connector",
]);
const AI_REVIEW_WORKFLOW_NAME = "AI review contract";
const QODO_COMMAND = "/qodo review";
const CODEX_COMMAND = "@codex review";
const MIN_QODO_REQUEST_GAP_MS = 15 * 60 * 1000;
const SECOND_QODO_TIMEOUT_MS = 15 * 60 * 1000;
const POLL_ATTEMPTS = 45;
const POLL_INTERVAL_MS = 20_000;
const LIMIT_SIGNAL_PATTERNS = [
  /review limit reached/i,
  /rate limit (?:has been )?(?:reached|exceeded|exhausted)/i,
  /quota (?:has been )?(?:reached|exceeded|exhausted)/i,
  /usage limit (?:has been )?(?:reached|exceeded|exhausted)/i,
  /next review available in/i,
  /temporarily unavailable[^\n]*(?:limit|quota)/i,
];
const NEGATED_LIMIT_SIGNAL_PATTERNS = [
  /\b(?:no|not|never|without)\b[^\n.!?]{0,80}\b(?:(?:review|rate|usage)\s+limit(?:ed)?|quota)\b/i,
  /\b(?:(?:review|rate|usage)\s+limit(?:ed)?|quota)\b[^\n.!?]{0,80}\b(?:not|never|no longer)\b/i,
];

const ACTIVE_PROVIDERS = [
  { name: "Qodo", command: QODO_COMMAND, logins: QODO_LOGINS },
  { name: "Codex", command: CODEX_COMMAND, logins: CODEX_LOGINS },
];
const DORMANT_PROVIDER_NAMES = new Set(["CodeRabbit"]);

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

function stripQuotedAndFencedMarkdown(body) {
  const visible = [];
  let fenceMarker = null;

  for (const line of String(body ?? "").split(/\r?\n/)) {
    const fence = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      const marker = fence[1][0];
      if (fenceMarker === null) fenceMarker = marker;
      else if (fenceMarker === marker) fenceMarker = null;
      continue;
    }
    if (fenceMarker !== null) continue;
    if (/^\s{0,3}>/.test(line)) continue;
    visible.push(line);
  }

  return visible.join("\n");
}

function hasPositiveProviderLimitSignal(body) {
  const visibleBody = stripQuotedAndFencedMarkdown(body);
  const clauses = visibleBody
    .split(/(?<=[.!?])\s+|\r?\n+/)
    .map((clause) => clause.trim())
    .filter(Boolean);

  return clauses.some((clause) => {
    if (!LIMIT_SIGNAL_PATTERNS.some((pattern) => pattern.test(clause))) {
      return false;
    }
    return !NEGATED_LIMIT_SIGNAL_PATTERNS.some((pattern) => pattern.test(clause));
  });
}

function providerLimitSignals(comments, logins, notBefore) {
  if (notBefore <= 0) return [];
  return comments
    .filter((item) => {
      if (!logins.has(item.user?.login)) return false;
      if (item.user?.type !== "Bot") return false;
      if (signalTimeOf(item) < notBefore) return false;
      return hasPositiveProviderLimitSignal(item.body ?? "");
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

function pullHeadMatches(pull, currentHead) {
  return pull?.head?.sha?.toLowerCase() === currentHead;
}

function qodoTimeoutPair(requests) {
  for (let secondIndex = 1; secondIndex < requests.length; secondIndex += 1) {
    const secondAt = createdTimeOf(requests[secondIndex]);
    for (let firstIndex = 0; firstIndex < secondIndex; firstIndex += 1) {
      const firstAt = createdTimeOf(requests[firstIndex]);
      if (secondAt - firstAt >= MIN_QODO_REQUEST_GAP_MS) {
        return { firstAt, secondAt };
      }
    }
  }
  return undefined;
}

function firstRequestAt(requests) {
  return requests.length > 0 ? createdTimeOf(requests[0]) : 0;
}

function collectProviderState({ comments, reviews, currentHead, headUpdateAnchor }) {
  return ACTIVE_PROVIDERS.map((provider) => {
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
  const requestedProviders = states
    .filter((state) => state.requestAt > 0)
    .map((state) => state.name);
  const warmStandbyRoundReady = states.every((state) => state.requestAt > 0);
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
      requestedProviders,
      warmStandbyRoundReady,
    };
  }

  const timeoutPair = qodoTimeoutPair(qodo.requests);
  const fallbackEligibleAt = timeoutPair
    ? timeoutPair.secondAt + SECOND_QODO_TIMEOUT_MS
    : 0;
  const timeoutFallbackEligible = warmStandbyRoundReady && fallbackEligibleAt > 0 && now >= fallbackEligibleAt;
  const limitFallbackEligible = warmStandbyRoundReady && unavailableProviders.length > 0;
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
      requestedProviders,
      warmStandbyRoundReady,
    };
  }

  const candidates = states
    .filter(
      (state) =>
        state.name !== "Qodo" &&
        !state.limitSignal &&
        state.review,
    )
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
      requestedProviders,
      warmStandbyRoundReady,
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
    requestedProviders,
    warmStandbyRoundReady,
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

      const [livePull, comments, reviews] = await Promise.all([
        github.rest.pulls.get({
          owner,
          repo,
          pull_number: pr.number,
        }),
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
            "A new commit invalidates all earlier requests, reviews, limit signals, timeout windows and merge-ready decisions.",
        );
        return;
      }

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
            "GitHub preserves the workflow run ID across rerun attempts. Every trusted request must contain an exact `Exact head: <SHA>` line. Qodo and Codex are the active reviewer pool and must both be requested after each head update before either provider-limit or timeout fallback can open. Qodo remains primary; an authenticated active-provider Bot rate, usage, quota, or review-limit signal opens automatic failover to the other available request-bound native exact-head reviewer. CodeRabbit is dormant and its requests, comments, limits, statuses and reviews do not affect this contract. " +
            "Quoted or fenced limit text, negated limit statements and a signal from the selected reviewer do not count. A limit signal is operational evidence only and never satisfies the review lane. Pending, dismissed, stale-head, non-bot, pre-anchor, unbound and pre-request evidence does not count.\n",
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
        `fallback_eligible=${Boolean(selection?.fallbackEligible)}; requested=${selection?.requestedProviders?.join(",") || "none"}; unavailable=${selection?.unavailableProviders?.join(",") || "none"}; head=${pr.head.sha}`,
    );
    if (attempt < POLL_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  core.setFailed(
    "Require request-bound native exact-head independent review evidence. Every trusted request must include `Exact head: <current full SHA>`. Request Qodo and Codex after every head update. " +
      "Qodo remains primary. Both provider-limit and timeout fallback open only after both active-provider requests exist. Provider-limit fallback additionally requires an authenticated active-provider Bot to report a positive unquoted rate, usage, quota, or review-limit condition; timeout fallback additionally requires the existing two-request Qodo timeout sequence. " +
      "CodeRabbit is dormant and cannot open, close or satisfy this gate. An unavailable provider cannot satisfy its own failover. A limit notice, negated or quoted limit statement, reaction, acknowledgement, status-only result, maintainer-authored proxy, unbound request, stale review, pending review, or dismissed review does not count as review evidence." +
      (lastApiError ? ` Last transient API error: ${lastApiError}` : ""),
  );
}

module.exports = verifyAiReviewContract;
module.exports._test = {
  ACTIVE_PROVIDER_NAMES: ACTIVE_PROVIDERS.map((provider) => provider.name),
  AI_REVIEW_WORKFLOW_NAME,
  DORMANT_PROVIDER_NAMES,
  LIMIT_SIGNAL_PATTERNS,
  NEGATED_LIMIT_SIGNAL_PATTERNS,
  MIN_QODO_REQUEST_GAP_MS,
  SECOND_QODO_TIMEOUT_MS,
  commandLinesOf,
  exactHeadReviews,
  freshTrustedRequests,
  hasExactHeadBinding,
  hasPositiveProviderLimitSignal,
  providerLimitSignals,
  pullHeadMatches,
  signalTimeOf,
  stripQuotedAndFencedMarkdown,
  qodoTimeoutPair,
  selectRequiredEvidence,
  stableHeadUpdateAnchor,
};
