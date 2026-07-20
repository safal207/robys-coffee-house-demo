import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const LEVELS = ["L1", "L2", "L3", "L4"];
const REQUIRED_STATUSES = [
  "AVAILABLE",
  "PARTIAL",
  "PAUSED",
  "QUOTA_EXHAUSTED",
  "NO_BALANCE",
  "NOT_CONFIGURED",
  "TIMED_OUT",
  "UNKNOWN"
];
const KINDS = new Set(["ai", "human"]);

function fail(message) {
  throw new Error(`RRM-ROSTER-001: ${message}`);
}

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) fail(`unexpected argument ${key}`);
    if (key === "--validate-only") {
      args.set(key, true);
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) fail(`missing value for ${key}`);
    args.set(key, value);
    index += 1;
  }
  return args;
}

function readJson(source, label) {
  try {
    return JSON.parse(source);
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function unique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) fail(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function sameSet(left, right) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function validateRoster(roster) {
  if (roster.contract !== "RRM-ROSTER-001") fail("unexpected contract");
  if (roster.version !== 1) fail("unsupported version");
  if (!Array.isArray(roster.allowedStatuses) || !sameSet(roster.allowedStatuses, REQUIRED_STATUSES)) {
    fail("allowedStatuses must define the complete runtime state set");
  }
  unique(roster.allowedStatuses, "status");

  if (!roster.bindingRequirements || typeof roster.bindingRequirements !== "object") {
    fail("bindingRequirements are required");
  }
  if (!roster.nonNegotiablePolicy || typeof roster.nonNegotiablePolicy !== "object") {
    fail("nonNegotiablePolicy is required");
  }
  const floors = roster.nonNegotiablePolicy.minimumBindingByDepth;
  if (!floors || typeof floors !== "object") fail("minimumBindingByDepth is required");
  for (const depth of LEVELS) {
    const requirement = roster.bindingRequirements[depth];
    if (!requirement || !Number.isInteger(requirement.minimumAvailable) || requirement.minimumAvailable < 1) {
      fail(`${depth} has invalid binding requirement`);
    }
    if (typeof requirement.requiresHuman !== "boolean") fail(`${depth} requiresHuman must be boolean`);
    if (requirement.minimumAvailable !== floors[depth]) {
      fail(`${depth} minimumAvailable must remain ${floors[depth]}`);
    }
    const mustRequireHuman = roster.nonNegotiablePolicy.humanRequiredDepths.includes(depth);
    if (requirement.requiresHuman !== mustRequireHuman) {
      fail(`${depth} human requirement does not match non-negotiable policy`);
    }
  }

  if (!Array.isArray(roster.reviewers) || roster.reviewers.length === 0) fail("reviewers must not be empty");
  unique(roster.reviewers.map((reviewer) => reviewer.id), "reviewer id");
  const reviewerMap = new Map(roster.reviewers.map((reviewer) => [reviewer.id, reviewer]));
  for (const reviewer of roster.reviewers) {
    if (typeof reviewer.id !== "string" || !reviewer.id.trim()) fail("reviewer has invalid id");
    if (typeof reviewer.label !== "string" || !reviewer.label.trim()) fail(`${reviewer.id} has no label`);
    if (!KINDS.has(reviewer.kind)) fail(`${reviewer.id} has invalid kind ${reviewer.kind}`);
    if (typeof reviewer.binding !== "boolean" || typeof reviewer.advisory !== "boolean") {
      fail(`${reviewer.id} has invalid authority flags`);
    }
    if (reviewer.binding && reviewer.advisory) fail(`${reviewer.id} cannot be binding and advisory`);
    if (!Array.isArray(reviewer.eligibleDepths) || reviewer.eligibleDepths.length === 0) {
      fail(`${reviewer.id} has no eligible depths`);
    }
    unique(reviewer.eligibleDepths, `${reviewer.id} eligible depth`);
    for (const depth of reviewer.eligibleDepths) {
      if (!LEVELS.includes(depth)) fail(`${reviewer.id} uses unknown depth ${depth}`);
    }
    if (!Array.isArray(reviewer.roles) || reviewer.roles.length === 0) fail(`${reviewer.id} has no roles`);
    unique(reviewer.roles, `${reviewer.id} role`);
    if (!roster.allowedStatuses.includes(reviewer.defaultStatus)) {
      fail(`${reviewer.id} has invalid defaultStatus ${reviewer.defaultStatus}`);
    }
  }

  for (const reviewerId of roster.nonNegotiablePolicy.advisoryReviewers) {
    const reviewer = reviewerMap.get(reviewerId);
    if (!reviewer) fail(`missing advisory reviewer ${reviewerId}`);
    if (reviewer.binding || !reviewer.advisory) fail(`${reviewerId} must remain advisory-only`);
  }
  for (const reviewer of roster.reviewers.filter((item) => item.advisory)) {
    if (!roster.nonNegotiablePolicy.advisoryReviewers.includes(reviewer.id)) {
      fail(`${reviewer.id} advisory authority must be declared non-negotiable`);
    }
  }

  const waiverPolicy = roster.nonNegotiablePolicy.providerLimitWaivers;
  if (!waiverPolicy || typeof waiverPolicy !== "object") fail("providerLimitWaivers are required");
  if (!Array.isArray(waiverPolicy.reviewers) || waiverPolicy.reviewers.length === 0) {
    fail("providerLimitWaivers.reviewers must not be empty");
  }
  if (!Array.isArray(waiverPolicy.statuses) || waiverPolicy.statuses.length !== 1 || waiverPolicy.statuses[0] !== "QUOTA_EXHAUSTED") {
    fail("providerLimitWaivers.statuses must remain QUOTA_EXHAUSTED only");
  }
  unique(waiverPolicy.reviewers, "provider-limit waiver reviewer");
  for (const reviewerId of waiverPolicy.reviewers) {
    const reviewer = reviewerMap.get(reviewerId);
    if (!reviewer) fail(`missing provider-limit waiver reviewer ${reviewerId}`);
    if (!reviewer.binding || reviewer.advisory || reviewer.kind !== "ai") {
      fail(`${reviewerId} provider-limit waiver requires a binding AI reviewer`);
    }
  }
  if (!waiverPolicy.reviewers.includes("coderabbit")) fail("CodeRabbit must remain the provider-limit waiver reviewer");
  if (waiverPolicy.reviewers.includes("human-maintainer")) fail("human reviewer cannot be provider-limit waived");

  for (const depth of LEVELS) {
    const eligibleBinding = roster.reviewers.filter(
      (reviewer) => reviewer.binding && reviewer.eligibleDepths.includes(depth)
    );
    const requirement = roster.bindingRequirements[depth];
    if (eligibleBinding.length < requirement.minimumAvailable) {
      fail(`${depth} has only ${eligibleBinding.length} eligible binding reviewers for minimum ${requirement.minimumAvailable}`);
    }
    if (requirement.requiresHuman && !eligibleBinding.some((reviewer) => reviewer.kind === "human")) {
      fail(`${depth} requires an eligible binding human reviewer`);
    }
  }

  return reviewerMap;
}

export function probeReviewerRoster(roster, depth, statuses = {}) {
  const reviewerMap = validateRoster(roster);
  if (!LEVELS.includes(depth)) fail(`unknown depth ${depth}`);
  if (!statuses || typeof statuses !== "object" || Array.isArray(statuses)) fail("statuses must be an object");
  for (const [reviewerId, status] of Object.entries(statuses)) {
    if (!reviewerMap.has(reviewerId)) fail(`status supplied for unknown reviewer ${reviewerId}`);
    if (!roster.allowedStatuses.includes(status)) fail(`${reviewerId} has invalid runtime status ${status}`);
  }

  const waiverReviewers = new Set(roster.nonNegotiablePolicy.providerLimitWaivers.reviewers);
  const waiverStatuses = new Set(roster.nonNegotiablePolicy.providerLimitWaivers.statuses);
  const reviewers = roster.reviewers
    .filter((reviewer) => reviewer.eligibleDepths.includes(depth))
    .map((reviewer) => {
      const runtimeStatus = statuses[reviewer.id] ?? reviewer.defaultStatus;
      const available = runtimeStatus === "AVAILABLE";
      const waivedByProviderLimit = reviewer.binding && reviewer.kind === "ai" &&
        waiverReviewers.has(reviewer.id) && waiverStatuses.has(runtimeStatus);
      const effectiveStatus = waivedByProviderLimit ? "AVAILABLE" : runtimeStatus;
      return {
        id: reviewer.id,
        label: reviewer.label,
        kind: reviewer.kind,
        status: effectiveStatus,
        runtimeStatus,
        binding: reviewer.binding,
        advisory: reviewer.advisory,
        roles: reviewer.roles,
        waivedByProviderLimit,
        countsTowardBinding: reviewer.binding && (available || waivedByProviderLimit),
        availableAdvisory: available && reviewer.advisory
      };
    });

  const requirement = roster.bindingRequirements[depth];
  const effectiveBinding = reviewers.filter((reviewer) => reviewer.countsTowardBinding);
  const availableAdvisory = reviewers.filter((reviewer) => reviewer.availableAdvisory);
  const partialReviewers = reviewers.filter((reviewer) => reviewer.runtimeStatus === "PARTIAL");
  const unavailableAdvisory = reviewers.filter(
    (reviewer) => reviewer.advisory && reviewer.runtimeStatus !== "AVAILABLE"
  );
  const waivedBinding = effectiveBinding.filter((reviewer) => reviewer.waivedByProviderLimit);
  const humanSatisfied = !requirement.requiresHuman || effectiveBinding.some(
    (reviewer) => reviewer.kind === "human" && reviewer.runtimeStatus === "AVAILABLE"
  );
  const capacitySatisfied = effectiveBinding.length >= requirement.minimumAvailable;
  const decision = capacitySatisfied && humanSatisfied ? "READY" : "ESCALATE";
  const reasons = [];
  if (!capacitySatisfied) reasons.push(`BINDING_CAPACITY_${effectiveBinding.length}_OF_${requirement.minimumAvailable}`);
  if (!humanSatisfied) reasons.push("HUMAN_REVIEWER_REQUIRED");

  const runtimeWarnings = [
    ...partialReviewers
      .filter((reviewer) => reviewer.binding)
      .map((reviewer) => `PARTIAL_BINDING_REVIEWER_${reviewer.id}`),
    ...unavailableAdvisory.map((reviewer) => `ADVISORY_REVIEWER_${reviewer.id}_${reviewer.runtimeStatus}`),
    ...waivedBinding.map((reviewer) => `BINDING_REVIEWER_${reviewer.id}_${reviewer.runtimeStatus}_WAIVED`)
  ];

  return {
    contract: "RRM-ROSTER-001",
    rosterVersion: roster.version,
    depth,
    decision,
    authority: "preflight-only",
    requiredBindingReviewers: requirement.minimumAvailable,
    availableBindingReviewers: effectiveBinding.map((reviewer) => reviewer.id),
    waivedBindingReviewers: waivedBinding.map((reviewer) => reviewer.id),
    optionalAdvisoryReviewers: reviewers.filter((reviewer) => reviewer.advisory).map((reviewer) => reviewer.id),
    availableAdvisoryReviewers: availableAdvisory.map((reviewer) => reviewer.id),
    unavailableAdvisoryReviewers: unavailableAdvisory.map((reviewer) => ({ id: reviewer.id, status: reviewer.runtimeStatus })),
    partialReviewers: partialReviewers.map((reviewer) => reviewer.id),
    runtimeWarnings,
    requiresHuman: requirement.requiresHuman,
    humanSatisfied,
    reasons,
    reviewers,
    note: "CodeRabbit is the binding AI reviewer. Only an explicit QUOTA_EXHAUSTED state may waive its execution step; the real runtimeStatus remains visible while route selection receives an effective AVAILABLE state. Human review, CI, evidence reporting and merge authorization remain mandatory. Codex and DeepSeek are advisory."
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rosterPath = args.get("--roster") || "qa/reviewer-roster.json";
  const roster = readJson(readFileSync(rosterPath, "utf8"), rosterPath);
  validateRoster(roster);
  if (args.get("--validate-only")) {
    process.stdout.write(`${JSON.stringify({ contract: roster.contract, valid: true })}\n`);
    return;
  }

  const depth = args.get("--depth") ?? process.env.REVIEW_DEPTH;
  if (!depth) fail("provide --depth or REVIEW_DEPTH");
  const statusesSource = args.get("--statuses-json") ?? process.env.REVIEWER_STATUSES_JSON ?? "{}";
  const result = probeReviewerRoster(roster, depth, readJson(statusesSource, "statuses"));
  const rendered = `${JSON.stringify(result, null, 2)}\n`;
  const outputPath = args.get("--output");
  if (outputPath) writeFileSync(outputPath, rendered);
  process.stdout.write(rendered);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
