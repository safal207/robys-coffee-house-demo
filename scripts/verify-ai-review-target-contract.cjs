"use strict";

const verifier = require("./verify-ai-review-contract.cjs");

const {
  AI_REVIEW_WORKFLOW_NAME,
  pullHeadMatches,
  selectRequiredEvidence,
} = verifier._test;

const WORKFLOW_PATH = ".github/workflows/ai-review-contract.yml";
const ALLOWED_ACTIONS = new Set(["opened", "synchronize", "reopened"]);
const POLL_ATTEMPTS = 45;
const POLL_INTERVAL_MS = 20_000;

function parseTime(value) {
  if (typeof value !== "string" || value.trim() === "") return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isFullSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}

function expectedRunTitle(prNumber, currentHead) {
  return `AI review PR #${prNumber} head ${currentHead.toLowerCase()}`;
}

function isPermissionError(error) {
  const message = error?.message ?? "";
  if (error?.status === 401) return true;
  if (error?.status !== 403) return false;
  return !/rate limit|secondary rate|abuse detection/i.test(message);
}

function targetContextError(context) {
  if (context.eventName !== "pull_request_target") {
    return "trusted AI review runner requires pull_request_target";
  }
  if (!ALLOWED_ACTIONS.has(context.payload?.action)) {
    return `unsupported pull_request_target action: ${context.payload?.action ?? "missing"}`;
  }
  if (!isFullSha(context.sha)) {
    return "trusted default-branch SHA is missing or malformed";
  }
  const defaultBranch = context.payload?.repository?.default_branch;
  if (typeof defaultBranch !== "string" || defaultBranch.trim() === "") {
    return "default branch is missing from the event payload";
  }
  const pr = context.payload?.pull_request;
  if (!Number.isInteger(pr?.number) || !isFullSha(pr?.head?.sha)) {
    return "pull_request_target payload is missing a valid PR number or head SHA";
  }
  return "";
}

function stableTargetRunAnchor(run, {
  currentRunId,
  trustedBaseSha,
  defaultBranch,
  prNumber,
  currentHead,
}) {
  if (run?.id !== currentRunId) return 0;
  if (run?.name !== AI_REVIEW_WORKFLOW_NAME) return 0;
  if (run?.event !== "pull_request_target") return 0;
  if (run?.head_sha?.toLowerCase() !== trustedBaseSha.toLowerCase()) return 0;
  if (run?.path !== `${WORKFLOW_PATH}@${defaultBranch}`) return 0;
  if (run?.display_title !== expectedRunTitle(prNumber, currentHead)) return 0;
  return parseTime(run.created_at);
}

async function resolveStableTargetAnchor({
  github,
  owner,
  repo,
  currentRunId,
  trustedBaseSha,
  defaultBranch,
  prNumber,
  currentHead,
}) {
  const response = await github.rest.actions.getWorkflowRun({
    owner,
    repo,
    run_id: currentRunId,
  });
  const anchor = stableTargetRunAnchor(response.data, {
    currentRunId,
    trustedBaseSha,
    defaultBranch,
    prNumber,
    currentHead,
  });
  if (anchor <= 0) {
    throw new Error(
      "current workflow run is not a default-branch-owned pull_request_target run bound to the trusted base SHA and exact PR head",
    );
  }
  return anchor;
}

async function verifyAiReviewTargetContract({ github, context, core }) {
  const contextError = targetContextError(context);
  if (contextError) {
    core.setFailed(contextError);
    return;
  }

  const { owner, repo } = context.repo;
  const pr = context.payload.pull_request;
  const currentHead = pr.head.sha.toLowerCase();
  const trustedBaseSha = context.sha.toLowerCase();
  const defaultBranch = context.payload.repository.default_branch;
  let headUpdateAnchor = 0;
  let lastApiError = "";

  for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
    let selection;

    try {
      if (headUpdateAnchor <= 0) {
        headUpdateAnchor = await resolveStableTargetAnchor({
          github,
          owner,
          repo,
          currentRunId: context.runId,
          trustedBaseSha,
          defaultBranch,
          prNumber: pr.number,
          currentHead,
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
          `Trusted AI review run targets stale head ${pr.head.sha}; current PR head is ${livePull.data?.head?.sha ?? "unknown"}. ` +
            "A new commit invalidates all earlier requests, reviews, provider-limit signals and timeout windows.",
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
          "Trusted AI review runner lacks required permissions. Grant actions: read, contents: read, issues: read and pull-requests: read. " +
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
            { data: "Trusted base", header: true },
            { data: "Primary failure", header: true },
            { data: "Unavailable providers", header: true },
          ],
          [
            selection.provider,
            selection.mode,
            "yes",
            trustedBaseSha,
            selection.primaryFailure,
            selection.unavailableProviders?.join(", ") || "none",
          ],
        ])
        .addRaw(
          `\nTrust boundary: workflow ${WORKFLOW_PATH}@${defaultBranch} and verifier code were loaded from trusted base ${trustedBaseSha}. ` +
            `Run title binds PR #${pr.number} to exact head ${currentHead}. ` +
            `Freshness anchor: GitHub-server created_at of pull_request_target run ${context.runId}. ` +
            "No pull-request code, dependency, artifact, cache or generated file is executed by this gate. " +
            "Every trusted request must contain an exact `Exact head: <SHA>` line. Qodo and Codex form the active pool; CodeRabbit is dormant. " +
            "Provider-limit notices are operational evidence only and never satisfy the review lane.\n",
        )
        .write();
      core.notice(
        `Verified ${selection.mode} review from ${selection.provider} for ${pr.head.sha}; trusted_base=${trustedBaseSha}; primary_failure=${selection.primaryFailure}.`,
      );
      return;
    }

    core.info(
      `Waiting for independent review evidence (${attempt}/${POLL_ATTEMPTS}); ` +
        `mode=${selection?.mode ?? "unknown"}; primary_failure=${selection?.primaryFailure ?? "unknown"}; ` +
        `fallback_eligible=${Boolean(selection?.fallbackEligible)}; requested=${selection?.requestedProviders?.join(",") || "none"}; ` +
        `unavailable=${selection?.unavailableProviders?.join(",") || "none"}; head=${pr.head.sha}; trusted_base=${trustedBaseSha}`,
    );
    if (attempt < POLL_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  core.setFailed(
    "Require request-bound native exact-head Qodo/Codex review evidence from the default-branch-owned pull_request_target gate. " +
      "Both active-provider requests must be posted after the GitHub-server workflow-run anchor. Stale, pre-request, unbound, pending, dismissed, non-Bot, proxy, acknowledgement-only and status-only evidence does not count." +
      (lastApiError ? ` Last transient API error: ${lastApiError}` : ""),
  );
}

module.exports = verifyAiReviewTargetContract;
module.exports._test = {
  ALLOWED_ACTIONS,
  WORKFLOW_PATH,
  expectedRunTitle,
  stableTargetRunAnchor,
  targetContextError,
};
