import { readFileSync } from "node:fs";
import { selectReviewRoute, validateReviewRoutePolicy } from "./select-review-route.mjs";

const policy = JSON.parse(readFileSync("qa/review-route-policy.json", "utf8"));
const head = "1234567890abcdef1234567890abcdef12345678";

const actors = {
  coderabbit: ["draft_reviewer", "risk_critic"],
  codex: ["advisory_reviewer", "risk_critic"],
  "human-maintainer": ["risk_critic", "evidence_verifier", "operator", "authorization_owner"],
  deepseek: ["advisory_reviewer"]
};

function depthResult(depth) {
  return { contract: "RRM-DEPTH-001", policyVersion: 1, depth };
}

function rosterResult(depth, ids, statuses = {}, decision = "READY") {
  const reviewers = ids.map((id) => {
    const advisory = id === "codex" || id === "deepseek";
    const status = statuses[id] || "AVAILABLE";
    return {
      id,
      label: id,
      kind: id === "human-maintainer" ? "human" : "ai",
      status,
      binding: !advisory,
      advisory,
      roles: actors[id],
      waivedByProviderLimit: false,
      countsTowardBinding: !advisory && status === "AVAILABLE",
      availableAdvisory: advisory && status === "AVAILABLE"
    };
  });
  return {
    contract: "RRM-ROSTER-001",
    rosterVersion: 1,
    depth,
    decision,
    authority: "preflight-only",
    reasons: [],
    availableBindingReviewers: reviewers.filter((item) => item.countsTowardBinding).map((item) => item.id),
    waivedBindingReviewers: [],
    availableAdvisoryReviewers: reviewers.filter((item) => item.availableAdvisory).map((item) => item.id),
    reviewers
  };
}

function expectFailure(label, expected, action) {
  try {
    action();
  } catch (error) {
    if (error.message.includes(expected)) return;
    throw new Error(`${label}: ${error.message}`);
  }
  throw new Error(`${label} should fail with ${expected}`);
}

validateReviewRoutePolicy(policy);
if (policy.nonNegotiablePolicy.providerLimitWaiver.actor !== "coderabbit") {
  throw new Error("CodeRabbit provider-limit waiver actor is missing");
}
if (policy.nonNegotiablePolicy.providerLimitWaiver.status !== "QUOTA_EXHAUSTED") {
  throw new Error("provider-limit waiver status must remain QUOTA_EXHAUSTED");
}

const l3Roster = rosterResult("L3", ["coderabbit", "human-maintainer", "codex"], {
  codex: "NO_BALANCE"
});
const first = selectReviewRoute(policy, depthResult("L3"), l3Roster, head);
const second = selectReviewRoute(policy, depthResult("L3"), l3Roster, head);
if (first.decision !== "SELECTED" || first.routeId !== "route-l3-standard") {
  throw new Error(`unexpected L3 route: ${JSON.stringify(first)}`);
}
if (JSON.stringify(first) !== JSON.stringify(second)) {
  throw new Error("identical inputs must produce identical route output");
}
if (!first.actors.includes("coderabbit") || first.actors.includes("codex")) {
  throw new Error("standard route is not CodeRabbit-first");
}

const missingHuman = selectReviewRoute(
  policy,
  depthResult("L3"),
  rosterResult("L3", ["coderabbit", "codex"]),
  head
);
if (missingHuman.decision !== "ESCALATE" || !missingHuman.missingActors.includes("human-maintainer")) {
  throw new Error("L3 without a human must escalate even when CodeRabbit is available");
}

const partialRoster = rosterResult(
  "L3",
  ["coderabbit", "human-maintainer", "codex"],
  { coderabbit: "PARTIAL", codex: "AVAILABLE" },
  "ESCALATE"
);
const partial = selectReviewRoute(policy, depthResult("L3"), partialRoster, head);
if (partial.decision !== "ESCALATE" || !partial.partialActors.includes("coderabbit")) {
  throw new Error("PARTIAL CodeRabbit must not enter an automatic route");
}

const auditedRoster = rosterResult("L3", ["coderabbit", "human-maintainer", "codex"], {
  codex: "QUOTA_EXHAUSTED"
});
const audited = selectReviewRoute(
  policy,
  depthResult("L3"),
  auditedRoster,
  head,
  {
    routeId: "route-l3-coderabbit-human",
    expectedHead: head,
    expectedDepth: "L3",
    approvedBy: "maintainer.alex",
    reason: "The exact-head governance review requires an intensified human proof route."
  }
);
if (audited.decision !== "SELECTED" || audited.selectionMode !== "override") {
  throw new Error("valid audited route selection failed");
}

expectFailure("short reason", "at least 24 characters", () => {
  selectReviewRoute(policy, depthResult("L3"), auditedRoster, head, {
    routeId: "route-l3-coderabbit-human",
    expectedHead: head,
    expectedDepth: "L3",
    approvedBy: "maintainer.alex",
    reason: "short"
  });
});

expectFailure("depth mismatch", "does not match selected depth", () => {
  selectReviewRoute(policy, depthResult("L3"), auditedRoster, head, {
    routeId: "route-l2-coderabbit-human",
    expectedHead: head,
    expectedDepth: "L3",
    approvedBy: "maintainer.alex",
    reason: "The requested route belongs to a different review depth."
  });
});

const advisoryPolicy = structuredClone(policy);
const standardL2 = advisoryPolicy.routes.find((route) => route.id === "route-l2-standard");
standardL2.requiredActors = ["codex", "human-maintainer"];
standardL2.stages.find((stage) => stage.actor === "coderabbit").actor = "codex";
const advisory = selectReviewRoute(
  advisoryPolicy,
  depthResult("L2"),
  rosterResult("L2", ["codex", "human-maintainer"]),
  head
);
if (advisory.decision !== "ESCALATE" || !advisory.reasons.some((reason) => reason.includes("codex"))) {
  throw new Error("Codex advisory authority must not satisfy a binding route");
}

expectFailure("automatic mapping", "L3 automatic route must remain route-l3-standard", () => {
  const changed = structuredClone(policy);
  changed.nonNegotiablePolicy.automaticRouteByDepth.L3 = "route-l1-standard";
  validateReviewRoutePolicy(changed);
});

expectFailure("L2 human requirement", "humanRequiredDepths must remain L2, L3, L4", () => {
  const changed = structuredClone(policy);
  changed.nonNegotiablePolicy.humanRequiredDepths = ["L3", "L4"];
  validateReviewRoutePolicy(changed);
});

expectFailure("binding actor floor policy", "L4 actor floor must remain 2", () => {
  const changed = structuredClone(policy);
  changed.nonNegotiablePolicy.minimumDistinctBindingActors.L4 = 1;
  validateReviewRoutePolicy(changed);
});

expectFailure("actor floor", "fewer than 2 distinct binding actors", () => {
  const changed = structuredClone(policy);
  const route = changed.routes.find((item) => item.id === "route-l4-standard");
  route.requiredActors = ["human-maintainer"];
  route.stages = route.stages.filter((stage) => stage.actor !== "coderabbit");
  validateReviewRoutePolicy(changed);
});

console.log("✅ RRM-ROUTE-001 tests passed: CodeRabbit is binding, Codex is advisory, routes stay deterministic, quota-waiver policy is explicit, and human authorization is preserved.");
