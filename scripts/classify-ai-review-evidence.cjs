const fs = require("node:fs");

module.exports = async ({ github, context, core }) => {
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

  const evidenceAfter = Date.parse(pr.updated_at);
  const currentHead = pr.head.sha.toLowerCase();
  const resultPath = "ai-review-contract-result.json";
  const timeOf = (item) => Math.max(
    0,
    ...[item.submitted_at, item.created_at, item.updated_at]
      .map((value) => Date.parse(value ?? 0))
      .filter(Number.isFinite),
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
    timeOf(item) >= evidenceAfter &&
    commandLinesOf(item).includes(value)
  );
  const latestRequestAt = (requests) => requests.reduce(
    (latest, request) => Math.max(latest, timeOf(request)),
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
      pollingWindowSeconds: 600,
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

  for (let attempt = 1; attempt <= 30; attempt += 1) {
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
      timeOf(review) >= latestCodexRequestAt
    ));
    const currentHeadCodeRabbitReview = reviews.find((review) => (
      codeRabbitLogins.has(review.user?.login) &&
      nativeReviewMatchesHead(review)
    ));
    const codeRabbitReview = reviews.find((review) => (
      codeRabbitLogins.has(review.user?.login) &&
      nativeReviewMatchesHead(review) &&
      timeOf(review) >= latestCodeRabbitRequestAt
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
      codexEvidenceAt: timeOf(codexReview ?? {}),
      codeRabbitEvidenceAt: Math.max(
        timeOf(codeRabbitReview ?? {}),
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
      `Waiting for latest-request exact-head AI evidence (attempt ${attempt}/30): ` +
        `Codex=${hasCodexRequest}/${hasCodexEvidence}, ` +
        `CodeRabbit=${hasCodeRabbitRequest}/${hasCodeRabbitEvidence}`,
    );
    if (attempt < 30) await sleep(20_000);
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
