const fs = require("node:fs");

module.exports = async ({
  github,
  context,
  core,
  pollAttempts = 30,
  pollIntervalMs = 20_000,
  resultPath = "ai-review-contract-result.json",
}) => {
  if (!Number.isInteger(pollAttempts) || pollAttempts < 1) {
    throw new Error("pollAttempts must be a positive integer");
  }
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 0) {
    throw new Error("pollIntervalMs must be a non-negative integer");
  }

  const owner = context.repo.owner;
  const repo = context.repo.repo;
  const pr = context.payload.pull_request;
  const trusted = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
  const codexLogins = new Set([
    "chatgpt-codex-connector[bot]",
    "chatgpt-codex-connector",
  ]);
  const codeRabbitLogins = new Set([
    "coderabbitai[bot]",
    "coderabbitai",
  ]);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const parseTime = (value) => {
    const parsed = Date.parse(value ?? "");
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const evidenceAfter = parseTime(pr.updated_at);
  const currentHead = pr.head.sha.toLowerCase();
  const timeOf = (item) => Math.max(
    parseTime(item.submitted_at),
    parseTime(item.created_at),
    parseTime(item.updated_at),
  );
  const commandCreatedAt = (item) => parseTime(item.created_at);
  const reviewSubmittedAt = (item) => (
    parseTime(item.submitted_at) || parseTime(item.created_at)
  );
  const toIso = (timestamp) => (
    timestamp > 0 ? new Date(timestamp).toISOString() : null
  );
  const bodyOf = (item) => (item.body ?? "").trim();
  const commandLinesOf = (item) => bodyOf(item)
    .toLowerCase()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const isCommand = (item, value) => (
    trusted.has(item.author_association) &&
    commandCreatedAt(item) >= evidenceAfter &&
    commandLinesOf(item).includes(value)
  );
  const latestRequestAt = (requests) => requests.reduce(
    (latest, request) => Math.max(latest, commandCreatedAt(request)),
    0,
  );
  const nativeReviewMatchesHead = (review) => (
    review.commit_id?.toLowerCase() === currentHead
  );
  const authority = {
    merge: false,
    deploy: false,
    routePromotion: false,
  };

  fs.writeFileSync(
    resultPath,
    `${JSON.stringify({
      schemaVersion: 1,
      classification: "IN_PROGRESS",
      exactHeadSha: currentHead,
      pullRequest: pr.number,
      authority,
    }, null, 2)}\n`,
    "utf8",
  );

  const writeResult = (observation, classification) => {
    const result = {
      schemaVersion: 1,
      classification,
      exactHeadSha: currentHead,
      pullRequest: pr.number,
      evidenceAfter: toIso(evidenceAfter),
      attemptCount: observation.attempt,
      pollingWindowSeconds: Math.ceil(
        (pollAttempts * pollIntervalMs) / 1000,
      ),
      providers: {
        codex: {
          requestDetected: observation.hasCodexRequest,
          latestRequestAt: toIso(observation.latestCodexRequestAt),
          evidenceDetected: observation.hasCodexEvidence,
          evidenceAt: toIso(observation.codexEvidenceAt),
          reviewCommitSha: observation.codexReview?.commit_id ?? null,
        },
        codeRabbit: {
          requestDetected: observation.hasCodeRabbitRequest,
          latestRequestAt: toIso(observation.latestCodeRabbitRequestAt),
          evidenceDetected: observation.hasCodeRabbitEvidence,
          evidenceAt: toIso(observation.codeRabbitEvidenceAt),
          reviewCommitSha: observation.codeRabbitReview?.commit_id ??
            observation.currentHeadCodeRabbitReview?.commit_id ??
            null,
          evidenceKind: observation.codeRabbitReview
            ? "native_review"
            : observation.codeRabbitStatusComment
              ? "no_new_commits_status"
              : null,
        },
      },
      authority,
    };

    fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  };

  const writeSummary = async (observation, classification) => {
    await core.summary
      .addHeading("AI review contract")
      .addRaw(`Classification: \`${classification}\`\n\n`)
      .addRaw(`Exact head: \`${currentHead}\`\n\n`)
      .addTable([
        [
          { data: "Reviewer", header: true },
          { data: "Fresh request", header: true },
          { data: "Exact-head evidence after request", header: true },
        ],
        [
          "Codex",
          observation.hasCodexRequest ? "yes" : "no",
          observation.hasCodexEvidence ? "yes" : "no",
        ],
        [
          "CodeRabbit",
          observation.hasCodeRabbitRequest ? "yes" : "no",
          observation.hasCodeRabbitEvidence ? "yes" : "no",
        ],
      ])
      .addRaw(
        "\nMissing provider evidence grants no merge, deployment, or route-promotion authority.\n",
      )
      .write();
  };

  let lastObservation = null;

  for (let attempt = 1; attempt <= pollAttempts; attempt += 1) {
    const [comments, reviews] = await Promise.all([
      github.paginate(
        github.rest.issues.listComments,
        { owner, repo, issue_number: pr.number, per_page: 100 },
      ),
      github.paginate(
        github.rest.pulls.listReviews,
        { owner, repo, pull_number: pr.number, per_page: 100 },
      ),
    ]);

    const codexRequests = comments.filter(
      (item) => isCommand(item, "@codex review"),
    );
    const codeRabbitRequests = comments.filter(
      (item) => isCommand(item, "@coderabbitai review"),
    );
    const latestCodexRequestAt = latestRequestAt(codexRequests);
    const latestCodeRabbitRequestAt = latestRequestAt(codeRabbitRequests);

    const codexReview = reviews.find((review) => (
      codexLogins.has(review.user?.login) &&
      nativeReviewMatchesHead(review) &&
      reviewSubmittedAt(review) >= latestCodexRequestAt
    ));
    const currentHeadCodeRabbitReview = reviews.find((review) => (
      codeRabbitLogins.has(review.user?.login) &&
      nativeReviewMatchesHead(review)
    ));
    const codeRabbitReview = reviews.find((review) => (
      codeRabbitLogins.has(review.user?.login) &&
      nativeReviewMatchesHead(review) &&
      reviewSubmittedAt(review) >= latestCodeRabbitRequestAt
    ));
    const codeRabbitStatusComment = comments.find((item) => {
      const body = bodyOf(item);
      const statusTime = timeOf(item);
      return (
        Boolean(currentHeadCodeRabbitReview) &&
        latestCodeRabbitRequestAt > 0 &&
        codeRabbitLogins.has(item.user?.login) &&
        statusTime >= latestCodeRabbitRequestAt &&
        body.includes(
          "<!-- This is an auto-generated comment: summarize by coderabbit.ai -->",
        ) &&
        body.includes("No new commits to review since the last review.")
      );
    });

    const hasCodexRequest = latestCodexRequestAt > 0;
    const hasCodeRabbitRequest = latestCodeRabbitRequestAt > 0;
    const hasCodexEvidence = Boolean(codexReview);
    const hasCodeRabbitEvidence = Boolean(
      codeRabbitReview || codeRabbitStatusComment,
    );

    lastObservation = {
      attempt,
      latestCodexRequestAt,
      latestCodeRabbitRequestAt,
      hasCodexRequest,
      hasCodeRabbitRequest,
      hasCodexEvidence,
      hasCodeRabbitEvidence,
      codexReview,
      codeRabbitReview,
      currentHeadCodeRabbitReview,
      codeRabbitStatusComment,
      codexEvidenceAt: reviewSubmittedAt(codexReview ?? {}),
      codeRabbitEvidenceAt: Math.max(
        reviewSubmittedAt(codeRabbitReview ?? {}),
        timeOf(codeRabbitStatusComment ?? {}),
      ),
    };

    if (
      hasCodexRequest &&
      hasCodeRabbitRequest &&
      hasCodexEvidence &&
      hasCodeRabbitEvidence
    ) {
      writeResult(lastObservation, "VERIFIED");
      await writeSummary(lastObservation, "VERIFIED");
      core.notice(
        `Exact-head AI evidence verified for ${pr.head.sha}: ` +
          "Codex and CodeRabbit complete after their latest requests.",
      );
      return;
    }

    core.info(
      `Waiting for latest-request exact-head AI evidence ` +
        `(attempt ${attempt}/${pollAttempts}): ` +
        `Codex=${hasCodexRequest}/${hasCodexEvidence}, ` +
        `CodeRabbit=${hasCodeRabbitRequest}/${hasCodeRabbitEvidence}`,
    );
    if (attempt < pollAttempts) await sleep(pollIntervalMs);
  }

  const classification = (
    lastObservation.hasCodexRequest &&
    lastObservation.hasCodeRabbitRequest
  )
    ? "PROVIDER_EVIDENCE_UNAVAILABLE"
    : "REQUEST_MISSING";

  writeResult(lastObservation, classification);
  await writeSummary(lastObservation, classification);
  core.setFailed(
    `${classification}: exact-head AI review evidence is incomplete for ` +
      `${pr.head.sha}. The contract remains fail-closed.`,
  );
};
