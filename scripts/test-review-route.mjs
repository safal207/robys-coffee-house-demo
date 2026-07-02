import { readFileSync } from "node:fs";
import { selectReviewRoute, validateReviewRoutePolicy } from "./select-review-route.mjs";

const policy = JSON.parse(readFileSync("qa/review-route-policy.json", "utf8"));
const head = "1234567890abcdef1234567890abcdef12345678";

const actors = {
  coderabbit: ["draft_reviewer", "risk_critic"],
  codex: ["risk_critic", "evidence_verifier"],
  "human-maintainer": ["risk_critic", "evidence_verifier", "operator", "authorization_owner"],
  deepseek: ["advisory_reviewer"]
};

function depthResult(depth) {
  return { contract: "RRM-DEPTH-001", policyVersion: 1, depth };
}

function rosterResult(depth, ids, statuses = {}, decision = "READY") {
  const reviewers = ids.map((id) => {
    const advisory = id === "deepseek";
    const status = statuses[id] || "AVAILABLE";
    return {
      id,
      label: id,
      kind: id === "human-maintainer" ? "human" : "ai",
      status,
      binding: !advisory,
      advisory,
      roles: actors[id],
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

const l3Roster = rosterResult("L3", ["coderabbit", "codex", "human-maintainer"]);
const first = selectReviewRoute(policy, depthResult("L3"), l3Roster, head);
const second = selectReviewRoute(policy, depthResult("L3"), l3Roster, head);
if (first.decision !== "SELECTED" || first.routeId !== "route-l3-standard") {
  throw new Error(`unexpected L3 route: ${JSON.stringify(first)}`);
}
if (JSON.stringify(first) !== JSON.stringify(second)) {
  throw new Error("identical inputs must produce identical route output");
}

const missingHuman = selectReviewRoute(
  policy,
  depthResult("L3"),
  rosterResult("L3", ["coderabbit", "codex"]),
  head
);
if (missingHuman.decision !== "ESCALATE" || !missingHuman.missingActors.includes("human-maintainer")) {
  throw new Error("L3 without a human must escalate");
}

const partialRoster = rosterResult(
  "L3",
  ["coderabbit", "codex", "human-maintainer"],
  { coderabbit: "PARTIAL" }
);
const partial = selectReviewRoute(policy, depthResult("L3"), partialRoster, head);
if (partial.decision !== "ESCALATE" || !partial.partialActors.includes("coderabbit")) {
  throw new Error("PARTIAL reviewer must not enter an automatic route");
}

const audited = selectReviewRoute(
  policy,
  depthResult("L3"),
  partialRoster,
  head,
  {
    routeId: "route-l3-codex-human",
    expectedHead: head,
    expectedDepth: "L3",
    approvedBy: "maintainer.alex",
    reason: "The standard reviewer is partial for this exact review episode."
  }
);
if (audited.decision !== "SELECTED" || audited.selectionMode !== "override") {
  throw new Error("valid audited route selection failed");
}

expectFailure("short reason", "at least 24 characters", () => {
  selectReviewRoute(policy, depthResult("L3"), partialRoster, head, {
    routeId: "route-l3-codex-human",
    expectedHead: head,
    expectedDepth: "L3",
    approvedBy: "maintainer.alex",
    reason: "short"
  });
});

expectFailure("depth mismatch", "does not match selected depth", () => {
  selectReviewRoute(policy, depthResult("L3"), partialRoster, head, {
    routeId: "route-l2-codex-human",
    expectedHead: head,
    expectedDepth: "L3",
    approvedBy: "maintainer.alex",
    reason: "The requested route belongs to a different review depth."
  });
});

const advisoryPolicy = structuredClone(policy);
const standardL2 = advisoryPolicy.routes.find((route) => route.id === "route-l2-standard");
standardL2.requiredActors = ["deepseek", "codex"];
standardL2.stages.find((stage) => stage.actor === "coderabbit").actor = "deepseek";
const advisory = selectReviewRoute(
  advisoryPolicy,
  depthResult("L2"),
  rosterResult("L2", ["deepseek", "codex"]),
  head
);
if (advisory.decision !== "ESCALATE" || !advisory.reasons.some((reason) => reason.includes("deepseek"))) {
  throw new Error("advisory actor must not satisfy a binding route");
}

expectFailure("automatic mapping", "L3 automatic route must remain route-l3-standard", () => {
  const changed = structuredClone(policy);
  changed.nonNegotiablePolicy.automaticRouteByDepth.L3 = "route-l1-standard";
  validateReviewRoutePolicy(changed);
});

expectFailure("actor floor", "fewer than 3 distinct binding actors", () => {
  const changed = structuredClone(policy);
  const route = changed.routes.find((item) => item.id === "route-l4-standard");
  route.requiredActors = ["codex", "human-maintainer"];
  route.stages = route.stages.filter((stage) => stage.actor !== "coderabbit");
  validateReviewRoutePolicy(changed);
});

console.log("✅ RRM-ROUTE-001 tests passed: deterministic routes, escalation, actor authority and audited manual selection.");
