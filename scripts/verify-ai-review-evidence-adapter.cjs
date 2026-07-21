"use strict";

const legacyVerifier = require("./verify-ai-review-contract.cjs");

const TRUSTED_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const CODERABBIT_LOGINS = new Set(["coderabbitai", "coderabbitai[bot]"]);
const AI_REVIEW_WORKFLOW_NAME = "AI review contract";
const CODERABBIT_COMMAND = "@coderabbitai review";
const CODERABBIT_MARKER = "<!-- coderabbit-reserve -->";
const WALKTHROUGH_MARKERS = ["<!-- walkthrough_start -->", "<!-- review_stack_entry_start -->"];
const FULL_SHA_RE = /\b[0-9a-f]{40}\b/gi;
const LIMIT_SIGNAL_PATTERNS = [
  /review limit reached/i,
  /rate limit (?:has been )?(?:reached|exceeded|exhausted)/i,
  /quota (?:has been )?(?:reached|exceeded|exhausted)/i,
  /usage limit (?:has been )?(?:reached|exceeded|exhausted)/i,
  /next review available in/i,
];

function parseTime(value) {
  if (typeof value !== "string" || value.trim() === "") return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createdTimeOf(item) {
  return parseTime(item?.created_at);
}

function observedTimeOf(item) {
  return Math.max(createdTimeOf(item), parseTime(item?.updated_at));
}

function commandLinesOf(item) {
  return String(item?.body ?? "")
    .toLowerCase()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function hasExactHeadRequest(item, currentHead) {
  const lines = commandLinesOf(item);
  return lines.includes(CODERABBIT_COMMAND) && lines.includes(`exact head: ${currentHead.toLowerCase()}`);
}

function isTrustedRequest(item, currentHead, headUpdateAnchor) {
  if (createdTimeOf(item) < headUpdateAnchor) return false;
  if (!hasExactHeadRequest(item, currentHead)) return false;
  if (TRUSTED_ASSOCIATIONS.has(item?.author_association)) return true;
  return item?.user?.login === "github-actions[bot]" && String(item?.body ?? "").includes(CODERABBIT_MARKER);
}

function isCodeRabbitBot(item) {
  return CODERABBIT_LOGINS.has(item?.user?.login) && item?.user?.type === "Bot";
}

function hasWalkthroughMarker(body) {
  const text = String(body ?? "");
  return WALKTHROUGH_MARKERS.some((marker) => text.includes(marker));
}

function fullHeadReferences(body) {
  return [...String(body ?? "").toLowerCase().matchAll(FULL_SHA_RE)].map((match) => match[0]);
}

function hasNoConflictingHeadReference(body, currentHead) {
  const references = fullHeadReferences(body);
  return references.length === 0 || references.includes(currentHead.toLowerCase());
}

function hasPositiveLimitSignal(body) {
  const text = String(body ?? "");
  if (/\b(?:no|not|without)\b[^\n.!?]{0,80}\b(?:rate limit|review limit|quota|usage limit)\b/i.test(text)) {
    return false;
  }
  return LIMIT_SIGNAL_PATTERNS.some((pattern) => pattern.test(text));
}

function isObservedAfterRequest(item, requestAt) {
  return observedTimeOf(item) >= requestAt;
}

function isCompletedWalkthrough(item, currentHead, requestAt) {
  const body = String(item?.body ?? "");
  if (!isCodeRabbitBot(item)) return false;
  if (!isObservedAfterRequest(item, requestAt)) return false;
  if (!hasWalkthroughMarker(body)) return false;
  if (!hasNoConflictingHeadReference(body, currentHead)) return false;
  if (hasPositiveLimitSignal(body)) return false;
  if (/\b(?:started|starting|queued|in progress)\b/i.test(body) && !body.includes("<!-- walkthrough_start -->")) {
    return false;
  }
  return true;
}

function latestTrustedRequestAt(comments, currentHead, headUpdateAnchor) {
  const requests = comments
    .filter((item) => isTrustedRequest(item, currentHead, headUpdateAnchor))
    .sort((left, right) => createdTimeOf(left) - createdTimeOf(right));
  return requests.length > 0 ? createdTimeOf(requests.at(-1)) : 0;
}

function selectWalkthroughEvidence({ comments, currentHead, headUpdateAnchor }) {
  const requestAt = latestTrustedRequestAt(comments, currentHead, headUpdateAnchor);
  if (requestAt <= 0) return null;
  return comments
    .filter((item) => isCompletedWalkthrough(item, currentHead, requestAt))
    .sort((left, right) => observedTimeOf(left) - observedTimeOf(right))
    .at(-1) ?? null;
}

function selectStableLimitEvidence({ comments, currentHead, headUpdateAnchor }) {
  const requestAt = latestTrustedRequestAt(comments, currentHead, headUpdateAnchor);
  if (requestAt <= 0) return null;
  return comments
    .filter((item) => {
      const body = String(item?.body ?? "");
      return (
        isCodeRabbitBot(item) &&
        isObservedAfterRequest(item, requestAt) &&
        hasWalkthroughMarker(body) &&
        hasNoConflictingHeadReference(body, currentHead) &&
        hasPositiveLimitSignal(body)
      );
    })
    .sort((left, right) => observedTimeOf(left) - observedTimeOf(right))
    .at(-1) ?? null;
}

function stableHeadUpdateAnchor(run, currentHead, currentRunId) {
  if (run?.id !== currentRunId) return 0;
  if (run?.name !== AI_REVIEW_WORKFLOW_NAME) return 0;
  if (run?.event !== "pull_request") return 0;
  if (String(run?.head_sha ?? "").toLowerCase() !== currentHead) return 0;
  return parseTime(run?.created_at);
}

async function verifyAiReviewEvidenceAdapter({
  github,
  context,
  core,
  legacyVerifierFn = legacyVerifier,
}) {
  const { owner, repo } = context.repo;
  const pr = context.payload.pull_request;
  if (!pr?.head?.sha) {
    core.setFailed("AI review evidence adapter requires a pull_request event with a head SHA.");
    return;
  }

  const currentHead = pr.head.sha.toLowerCase();
  try {
    const runResponse = await github.rest.actions.getWorkflowRun({
      owner,
      repo,
      run_id: context.runId,
    });
    const headUpdateAnchor = stableHeadUpdateAnchor(runResponse.data, currentHead, context.runId);
    if (headUpdateAnchor <= 0) {
      core.setFailed("current AI review workflow run is not bound to the current pull-request head");
      return;
    }

    const [livePull, comments] = await Promise.all([
      github.rest.pulls.get({ owner, repo, pull_number: pr.number }),
      github.paginate(github.rest.issues.listComments, {
        owner,
        repo,
        issue_number: pr.number,
        since: new Date(headUpdateAnchor).toISOString(),
        per_page: 100,
      }),
    ]);

    if (String(livePull.data?.head?.sha ?? "").toLowerCase() !== currentHead) {
      core.setFailed(
        `AI review workflow head ${pr.head.sha} is stale; current pull-request head is ${livePull.data?.head?.sha ?? "unknown"}.`,
      );
      return;
    }

    const limitSignal = selectStableLimitEvidence({ comments, currentHead, headUpdateAnchor });
    if (limitSignal) {
      await core.summary
        .addHeading("AI review contract")
        .addTable([
          [
            { data: "Required reviewer", header: true },
            { data: "Mode", header: true },
            { data: "Exact head", header: true },
            { data: "Provider-limit waiver", header: true },
          ],
          ["CodeRabbit", "provider-limit-bypass", "request-bound", "yes"],
        ])
        .addRaw(
          `\nAccepted an authenticated CodeRabbit limit signal observed after the latest trusted exact-head request for ${pr.head.sha}. ` +
            "The live PR head is rechecked before selection. A stable provider comment may omit a SHA, but any explicit full SHA must include the current head. " +
            "This waives only external delivery; CI, finding disposition, human approval and authority boundaries remain mandatory.\n",
        )
        .write();
      core.warning(`CodeRabbit provider-limit waiver verified for ${pr.head.sha}.`);
      return;
    }

    const walkthrough = selectWalkthroughEvidence({ comments, currentHead, headUpdateAnchor });
    if (walkthrough) {
      await core.summary
        .addHeading("AI review contract")
        .addTable([
          [
            { data: "Required reviewer", header: true },
            { data: "Mode", header: true },
            { data: "Exact head", header: true },
            { data: "Provider-limit waiver", header: true },
          ],
          ["CodeRabbit", "authenticated-walkthrough", "request-bound", "no"],
        ])
        .addRaw(
          `\nAccepted an authenticated CodeRabbit walkthrough updated after the latest trusted exact-head request for ${pr.head.sha}. ` +
            "The live PR head is rechecked before selection. A stable walkthrough may omit a SHA, but any explicit full SHA must include the current head. " +
            "This proves review delivery only; finding disposition and human authority remain separate.\n",
        )
        .write();
      core.notice(`Verified request-bound CodeRabbit walkthrough for ${pr.head.sha}.`);
      return;
    }
  } catch (error) {
    core.error(
      `Walkthrough adapter failed unexpectedly, falling back to the legacy verifier: ${error?.message ?? String(error)}`,
    );
  }

  await legacyVerifierFn({ github, context, core });
}

module.exports = verifyAiReviewEvidenceAdapter;
module.exports._test = {
  AI_REVIEW_WORKFLOW_NAME,
  CODERABBIT_COMMAND,
  CODERABBIT_MARKER,
  FULL_SHA_RE,
  LIMIT_SIGNAL_PATTERNS,
  WALKTHROUGH_MARKERS,
  createdTimeOf,
  fullHeadReferences,
  hasNoConflictingHeadReference,
  hasPositiveLimitSignal,
  hasWalkthroughMarker,
  isCompletedWalkthrough,
  isTrustedRequest,
  latestTrustedRequestAt,
  observedTimeOf,
  selectStableLimitEvidence,
  selectWalkthroughEvidence,
  stableHeadUpdateAnchor,
};
