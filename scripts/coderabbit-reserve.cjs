"use strict";

const TRUSTED_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const CODEX_LOGINS = new Set([
  "chatgpt-codex-connector",
  "chatgpt-codex-connector[bot]",
]);
const CODERABBIT_LOGINS = new Set(["coderabbitai", "coderabbitai[bot]"]);
const CODEX_COMMAND = "@codex review";
const CODERABBIT_COMMAND = "@coderabbitai review";
const RESERVE_MARKER = "<!-- coderabbit-reserve -->";
const TIME_ZONE = "Europe/Istanbul";
const CODEX_WAIT_MS = 45 * 60 * 1000;
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
    /reviewed\s+commit\s*:\s*(?:\*\*)?\s*`?([0-9a-f]{7,40})`?/i,
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

function trustedRequests(comments, command, head, notBefore) {
  return comments
    .filter(
      (comment) =>
        TRUSTED_ASSOCIATIONS.has(comment.author_association) &&
        createdTimeOf(comment) >= notBefore &&
        commandLinesOf(comment).includes(command) &&
        hasExactHeadBinding(comment, head),
    )
    .sort((left, right) => createdTimeOf(left) - createdTimeOf(right));
}

function exactHeadEvidence({ comments, reviews, logins, head, requestAt }) {
  if (requestAt <= 0) return [];
  const nativeReviews = reviews.filter(
    (review) =>
      isBotFrom(review, logins) &&
      isSubmittedReview(review) &&
      submittedTimeOf(review) >= requestAt &&
      isExactHeadCommit(reviewedCommitOf(review), head),
  );
  const botComments = comments.filter(
    (comment) =>
      isBotFrom(comment, logins) &&
      createdTimeOf(comment) >= requestAt &&
      isExactHeadCommit(reviewedCommitOf(comment), head),
  );
  return [...nativeReviews, ...botComments];
}

function reserveRequests(comments, head) {
  return comments
    .filter(
      (comment) =>
        comment?.user?.login === "github-actions[bot]" &&
        String(comment?.body ?? "").includes(RESERVE_MARKER) &&
        commandLinesOf(comment).includes(CODERABBIT_COMMAND) &&
        hasExactHeadBinding(comment, head),
    )
    .sort((left, right) => createdTimeOf(left) - createdTimeOf(right));
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

function hasPositiveLimitSignal(body) {
  const text = String(body ?? "");
  if (/\b(?:no|not|without)\b[^\n.!?]{0,80}\b(?:rate limit|review limit|quota|usage limit)\b/i.test(text)) {
    return false;
  }
  return LIMIT_SIGNAL_PATTERNS.some((pattern) => pattern.test(text));
}

function latestCodeRabbitLimitSignal(comments, notBefore) {
  return comments
    .filter(
      (comment) =>
        isBotFrom(comment, CODERABBIT_LOGINS) &&
        Math.max(createdTimeOf(comment), updatedTimeOf(comment)) >= notBefore &&
        hasPositiveLimitSignal(comment.body),
    )
    .sort(
      (left, right) =>
        Math.max(createdTimeOf(left), updatedTimeOf(left)) -
        Math.max(createdTimeOf(right), updatedTimeOf(right)),
    )
    .at(-1);
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

  const codexRequests = trustedRequests(comments, CODEX_COMMAND, head, headAt);
  if (codexRequests.length === 0) {
    return { eligible: false, reason: "NO_CODEX_REQUEST", head };
  }

  const earliestCodexRequestAt = createdTimeOf(codexRequests[0]);
  const latestCodexRequestAt = createdTimeOf(codexRequests.at(-1));
  const codexEvidence = exactHeadEvidence({
    comments,
    reviews,
    logins: CODEX_LOGINS,
    head,
    requestAt: earliestCodexRequestAt,
  });
  if (codexEvidence.length > 0) {
    return { eligible: false, reason: "CODEX_COMPLETE", head, codexRequestAt: latestCodexRequestAt };
  }

  if (nowMs - latestCodexRequestAt < CODEX_WAIT_MS) {
    return { eligible: false, reason: "CODEX_WAIT", head, codexRequestAt: latestCodexRequestAt };
  }

  const rabbitEvidence = exactHeadEvidence({
    comments,
    reviews,
    logins: CODERABBIT_LOGINS,
    head,
    requestAt: headAt,
  });
  if (rabbitEvidence.length > 0) {
    return { eligible: false, reason: "CODERABBIT_COMPLETE", head, codexRequestAt: latestCodexRequestAt };
  }

  const requests = reserveRequests(comments, head);
  const latestReserveAt = requests.length > 0 ? createdTimeOf(requests.at(-1)) : 0;
  if (latestReserveAt > 0 && nowMs - latestReserveAt < RETRY_GAP_MS) {
    return { eligible: false, reason: "RESERVE_COOLDOWN", head, codexRequestAt: latestCodexRequestAt };
  }

  const today = localDateKey(nowMs);
  const requestsToday = requests.filter((request) => localDateKey(createdTimeOf(request)) === today).length;
  if (requestsToday >= MAX_REQUESTS_PER_LOCAL_DAY) {
    return { eligible: false, reason: "DAILY_HEAD_CAP", head, codexRequestAt: latestCodexRequestAt };
  }

  const latestLimit = latestCodeRabbitLimitSignal(comments, latestReserveAt || headAt);
  const latestLimitAt = latestLimit
    ? Math.max(createdTimeOf(latestLimit), updatedTimeOf(latestLimit))
    : 0;
  if (latestLimitAt > 0 && nowMs - latestLimitAt < RETRY_GAP_MS) {
    return { eligible: false, reason: "PROVIDER_LIMIT_COOLDOWN", head, codexRequestAt: latestCodexRequestAt };
  }

  return {
    eligible: true,
    reason: "CODEX_MISSING_AFTER_WAIT",
    head,
    codexRequestAt: latestCodexRequestAt,
    requestsToday,
    draft: Boolean(pull.draft),
    pullNumber: pull.number,
  };
}

function reserveWindowLabel(context) {
  return WINDOW_LABELS.get(context?.payload?.schedule) ?? "manual";
}

function requestBody({ head, windowLabel }) {
  return `${RESERVE_MARKER}\n${CODERABBIT_COMMAND}\n\nExact head: ${head}\nReserve window: ${windowLabel} ${TIME_ZONE}\nReason: Codex exact-head evidence is still missing after the bounded 45-minute wait.\nPolicy: advisory emergency reserve only; CodeRabbit cannot replace or satisfy Codex, and its absence never blocks readiness.`;
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

async function dispatchCodeRabbitReserve({ github, context, core, nowMs = Date.now() }) {
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
        `Manual reserve input is stale: expected head ${expectedHead}, current head ${pulls[0]?.head?.sha ?? "unknown"}.`,
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
      return left.codexRequestAt - right.codexRequestAt;
    })
    .slice(0, MAX_REQUESTS_PER_RUN);

  const windowLabel = reserveWindowLabel(context);
  for (const item of eligible) {
    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: item.pull.number,
      body: requestBody({ head: item.head, windowLabel }),
    });
    core.notice(
      `Requested advisory CodeRabbit reserve review for PR #${item.pull.number} at ${item.head}; window=${windowLabel}.`,
    );
  }

  const reasonCounts = new Map();
  for (const item of evaluated.filter((candidate) => !candidate.eligible)) {
    reasonCounts.set(item.reason, (reasonCounts.get(item.reason) ?? 0) + 1);
  }
  await core.summary
    .addHeading("CodeRabbit reserve windows")
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
      `\nSchedule: 09:00, 13:00 and 19:00 ${TIME_ZONE}. Codex wait: 45 minutes. ` +
        `Per-head local-day cap: ${MAX_REQUESTS_PER_LOCAL_DAY}. Retry gap: ${RETRY_GAP_MS / 3_600_000} hours. ` +
        `Skipped: ${[...reasonCounts.entries()].map(([reason, count]) => `${reason}=${count}`).join(", ") || "none"}.\n`,
    )
    .write();
}

module.exports = dispatchCodeRabbitReserve;
module.exports._test = {
  CODEX_COMMAND,
  CODERABBIT_COMMAND,
  CODEX_WAIT_MS,
  MAX_REQUESTS_PER_LOCAL_DAY,
  MAX_REQUESTS_PER_RUN,
  RESERVE_MARKER,
  RETRY_GAP_MS,
  TIME_ZONE,
  commandLinesOf,
  evaluateCandidate,
  exactHeadEvidence,
  hasExactHeadBinding,
  hasPositiveLimitSignal,
  localDateKey,
  requestBody,
  reserveRequests,
  reviewedCommitOf,
  trustedRequests,
};
