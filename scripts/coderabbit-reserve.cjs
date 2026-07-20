"use strict";

const TRUSTED_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const CODERABBIT_LOGINS = new Set(["coderabbitai", "coderabbitai[bot]"]);
const CODERABBIT_COMMAND = "@coderabbitai review";
const REQUEST_MARKER = "<!-- coderabbit-reserve -->";
const TIME_ZONE = "Europe/Istanbul";
const INITIAL_WAIT_MS = 45 * 60 * 1000;
const RETRY_GAP_MS = 3 * 60 * 60 * 1000;
const MAX_REQUESTS_PER_LOCAL_DAY = 3;
const MAX_REQUESTS_PER_RUN = 1;
const WINDOW_LABELS = new Map([
  ["0 6 * * *", "09:00"],
  ["0 10 * * *", "13:00"],
  ["0 16 * * *", "19:00"],
]);
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

function updatedTimeOf(item) {
  return parseTime(item?.updated_at);
}

function commandLinesOf(item) {
  return String(item?.body ?? "")
    .toLowerCase()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function hasExactHeadBinding(item, head) {
  return commandLinesOf(item).includes(`exact head: ${head.toLowerCase()}`);
}

function reviewedCommitOf(item) {
  const native = String(item?.commit_id ?? "").trim().toLowerCase();
  if (/^[0-9a-f]{7,40}$/.test(native)) return native;
  const match = String(item?.body ?? "").match(
    /reviewed\s+commit\s*:\s*[*_]*\s*`?([0-9a-f]{7,40})`?/i,
  );
  return match?.[1]?.toLowerCase() ?? "";
}

function isExactHeadCommit(evidenceCommit, head) {
  return Boolean(evidenceCommit && evidenceCommit.length >= 7 && head.toLowerCase().startsWith(evidenceCommit));
}

function isBotFrom(item, logins) {
  return logins.has(item?.user?.login) && item?.user?.type === "Bot";
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

function isTrustedRequest(item, head, notBefore) {
  if (createdTimeOf(item) < notBefore) return false;
  if (!commandLinesOf(item).includes(CODERABBIT_COMMAND)) return false;
  if (!hasExactHeadBinding(item, head)) return false;
  if (TRUSTED_ASSOCIATIONS.has(item.author_association)) return true;
  return item?.user?.login === "github-actions[bot]" && String(item?.body ?? "").includes(REQUEST_MARKER);
}

function codeRabbitRequests(comments, head, notBefore) {
  return comments
    .filter((comment) => isTrustedRequest(comment, head, notBefore))
    .sort((left, right) => createdTimeOf(left) - createdTimeOf(right));
}

function exactHeadEvidence({ comments, reviews, head, requestAt }) {
  if (requestAt <= 0) return [];
  const nativeReviews = reviews.filter(
    (review) =>
      isBotFrom(review, CODERABBIT_LOGINS) &&
      isSubmittedReview(review) &&
      submittedTimeOf(review) >= requestAt &&
      isExactHeadCommit(reviewedCommitOf(review), head),
  );
  const botComments = comments.filter(
    (comment) =>
      isBotFrom(comment, CODERABBIT_LOGINS) &&
      createdTimeOf(comment) >= requestAt &&
      isFinalCodeRabbitCommentEvidence(comment) &&
      isExactHeadCommit(reviewedCommitOf(comment), head),
  );
  return [...nativeReviews, ...botComments];
}

function latestCodeRabbitLimitSignal(comments, requestAt) {
  if (requestAt <= 0) return undefined;
  return comments
    .filter(
      (comment) =>
        isBotFrom(comment, CODERABBIT_LOGINS) &&
        createdTimeOf(comment) >= requestAt &&
        hasPositiveLimitSignal(comment.body),
    )
    .sort((left, right) => createdTimeOf(left) - createdTimeOf(right))
    .at(-1);
}

function localDateKey(timestampMs) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestampMs));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function headCommitTime(headCommit) {
  return parseTime(
    headCommit?.commit?.committer?.date ??
      headCommit?.commit?.author?.date ??
      headCommit?.committer?.date ??
      headCommit?.author?.date,
  );
}

function evaluateCandidate({ pull, comments, reviews, headCommit, nowMs }) {
  if (pull?.state !== "open" || pull?.merged_at) {
    return { eligible: false, reason: "PR_NOT_OPEN" };
  }

  const head = String(pull?.head?.sha ?? "").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(head)) {
    return { eligible: false, reason: "INVALID_HEAD" };
  }

  const headAt = headCommitTime(headCommit);
  if (headAt <= 0) return { eligible: false, reason: "MISSING_HEAD_TIME", head };
  if (nowMs - headAt < INITIAL_WAIT_MS) {
    return { eligible: false, reason: "HEAD_WAIT", head };
  }

  const requests = codeRabbitRequests(comments, head, headAt);
  const earliestRequestAt = requests.length > 0 ? createdTimeOf(requests[0]) : 0;
  const latestRequestAt = requests.length > 0 ? createdTimeOf(requests.at(-1)) : 0;

  if (earliestRequestAt > 0) {
    const evidence = exactHeadEvidence({ comments, reviews, head, requestAt: earliestRequestAt });
    if (evidence.length > 0) {
      return { eligible: false, reason: "CODERABBIT_COMPLETE", head };
    }
  }

  const limitSignal = latestCodeRabbitLimitSignal(comments, latestRequestAt);
  if (limitSignal) {
    return { eligible: false, reason: "PROVIDER_LIMIT_WAIVED", head };
  }

  if (latestRequestAt > 0 && nowMs - latestRequestAt < RETRY_GAP_MS) {
    return { eligible: false, reason: "REQUEST_COOLDOWN", head };
  }

  const today = localDateKey(nowMs);
  const requestsToday = requests.filter((request) => localDateKey(createdTimeOf(request)) === today).length;
  if (requestsToday >= MAX_REQUESTS_PER_LOCAL_DAY) {
    return { eligible: false, reason: "DAILY_HEAD_CAP", head };
  }

  return {
    eligible: true,
    reason: requests.length === 0 ? "INITIAL_REQUIRED_REQUEST" : "RETRY_REQUIRED_REQUEST",
    head,
    requestsToday,
    draft: Boolean(pull.draft),
    pullNumber: pull.number,
    waitingSince: latestRequestAt || headAt,
  };
}

function requestWindowLabel(context) {
  return WINDOW_LABELS.get(context?.payload?.schedule) ?? "manual";
}

function requestBody({ head, windowLabel }) {
  return `${REQUEST_MARKER}\n${CODERABBIT_COMMAND}\n\nExact head: ${head}\nRequest window: ${windowLabel} ${TIME_ZONE}\nReason: required CodeRabbit exact-head evidence is still missing.\nPolicy: a final review satisfies the AI lane; an explicit authenticated limit/quota response activates only the documented provider-limit waiver. Human approval, CI, dispositions and D6 remain mandatory.`;
}

async function loadCandidateData({ github, owner, repo, pull }) {
  const head = pull.head.sha;
  const [comments, reviews, headCommit] = await Promise.all([
    github.paginate(github.rest.issues.listComments, {
      owner,
      repo,
      issue_number: pull.number,
      per_page: 100,
    }),
    github.paginate(github.rest.pulls.listReviews, {
      owner,
      repo,
      pull_number: pull.number,
      per_page: 100,
    }),
    github.rest.repos.getCommit({ owner, repo, ref: head }),
  ]);
  return { comments, reviews, headCommit: headCommit.data };
}

async function dispatchCodeRabbitRequest({ github, context, core, nowMs = Date.now() }) {
  const { owner, repo } = context.repo;
  const inputs = context.payload.inputs ?? {};
  const requestedNumber = Number.parseInt(String(inputs.pr_number ?? ""), 10);
  const expectedHead = String(inputs.expected_head_sha ?? "").trim().toLowerCase();

  let pulls;
  if (Number.isInteger(requestedNumber) && requestedNumber > 0) {
    const response = await github.rest.pulls.get({ owner, repo, pull_number: requestedNumber });
    pulls = [response.data];
  } else {
    pulls = await github.paginate(github.rest.pulls.list, {
      owner,
      repo,
      state: "open",
      sort: "updated",
      direction: "asc",
      per_page: 100,
    });
  }

  if (expectedHead) {
    if (pulls.length !== 1 || pulls[0]?.head?.sha?.toLowerCase() !== expectedHead) {
      core.setFailed(
        `Manual CodeRabbit input is stale: expected head ${expectedHead}, current head ${pulls[0]?.head?.sha ?? "unknown"}.`,
      );
      return;
    }
  }

  const evaluated = [];
  for (const pull of pulls) {
    try {
      const data = await loadCandidateData({ github, owner, repo, pull });
      evaluated.push({ pull, ...evaluateCandidate({ pull, ...data, nowMs }) });
    } catch (error) {
      core.warning(`Could not evaluate PR #${pull.number}: ${error?.message ?? String(error)}`);
    }
  }

  const eligible = evaluated
    .filter((item) => item.eligible)
    .sort((left, right) => {
      const draftDelta = Number(left.draft) - Number(right.draft);
      if (draftDelta !== 0) return draftDelta;
      return left.waitingSince - right.waitingSince;
    })
    .slice(0, MAX_REQUESTS_PER_RUN);

  const windowLabel = requestWindowLabel(context);
  for (const item of eligible) {
    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: item.pull.number,
      body: requestBody({ head: item.head, windowLabel }),
    });
    core.notice(`Requested required CodeRabbit review for PR #${item.pull.number} at ${item.head}; window=${windowLabel}.`);
  }

  const reasonCounts = new Map();
  for (const item of evaluated.filter((candidate) => !candidate.eligible)) {
    reasonCounts.set(item.reason, (reasonCounts.get(item.reason) ?? 0) + 1);
  }
  await core.summary
    .addHeading("CodeRabbit required-review windows")
    .addTable([
      [
        { data: "Window", header: true },
        { data: "Evaluated PRs", header: true },
        { data: "Requests posted", header: true },
        { data: "Per-run cap", header: true },
      ],
      [windowLabel, String(evaluated.length), String(eligible.length), String(MAX_REQUESTS_PER_RUN)],
    ])
    .addRaw(
      `\nSchedule: 09:00, 13:00 and 19:00 ${TIME_ZONE}. Initial head wait: 45 minutes. ` +
        `Per-head local-day cap: ${MAX_REQUESTS_PER_LOCAL_DAY}. Retry gap: ${RETRY_GAP_MS / 3_600_000} hours. ` +
        `Skipped: ${[...reasonCounts.entries()].map(([reason, count]) => `${reason}=${count}`).join(", ") || "none"}.\n`,
    )
    .write();
}

module.exports = dispatchCodeRabbitRequest;
module.exports._test = {
  CODERABBIT_COMMAND,
  INITIAL_WAIT_MS,
  MAX_REQUESTS_PER_LOCAL_DAY,
  MAX_REQUESTS_PER_RUN,
  REQUEST_MARKER,
  RETRY_GAP_MS,
  TIME_ZONE,
  codeRabbitRequests,
  commandLinesOf,
  evaluateCandidate,
  exactHeadEvidence,
  hasExactHeadBinding,
  hasPositiveLimitSignal,
  isFinalCodeRabbitCommentEvidence,
  localDateKey,
  requestBody,
  reviewedCommitOf,
};
