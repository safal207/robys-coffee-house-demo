import { readFileSync } from "node:fs";
import { selectReviewRoute, validateReviewRoutePolicy } from "./select-review-route.mjs";

const policy = JSON.parse(readFileSync("qa/review-route-policy.json", "utf8"));
const head = "1234567890abcdef1234567890abcdef12345678";

const actors = {
  codex: ["advisory_reviewer", "risk_critic"],
  "human-maintainer": ["draft_reviewer", "risk_critic", "evidence_verifier", "operator", "authorization_owner"],
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
      runtimeStatus: status,
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
    reasons: decision === "READY" ? [] : ["HUMAN_REVIEWER_REQUIRED"],
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

const l3Roster = rosterResult("L3", ["human-maintainer", "codex"], { codex: "NO_BALANCE" });
const first = selectReviewRoute(policy, depthResult("L3"), l3Roster, head);
const second = selectReviewRoute(policy, depthResult("L3"), l3Roster, head);
if (first.decision !== "SELECTED" || first.routeId !== "route-l3-standard") {
  throw new Error(`unexpected L3 route: ${JSON.stringify(first)}`);
}
if (JSON.stringify(first) !== JSON.stringify(second)) {
  throw new Error("identical inputs must produce identical route output");
}
if (!first.actors.includes("human-maintainer") || first.actors.includes("codex")) {
  throw new Error("standard route must be maintainer-bound and provider-neutral");
}

const missingHuman = selectReviewRoute(
  policy,
  depthResult("L3"),
  rosterResult("L3", ["codex"], {}, "ESCALATE"),
  head
);
if (missingHuman.decision !== "ESCALATE" || !missingHuman.missingActors.includes("human-maintainer")) {
  throw new Error("L3 without a human maintainer must escalate");
}

const partialRoster = rosterResult(
  "L3",
  ["human-maintainer", "codex"],
  { "human-maintainer": "PARTIAL", codex: "AVAILABLE" },
  "ESCALATE"
);
const partial = selectReviewRoute(policy, depthResult("L3"), partialRoster, head);
if (partial.decision !== "ESCALATE" || !partial.partialActors.includes("human-maintainer")) {
  throw new Error("PARTIAL human maintainer must not enter an automatic route");
}

const advisoryPolicy = structuredClone(policy);
const standardL2 = advisoryPolicy.routes.find((route) => route.id === "route-l2-standard");
standardL2.requiredActors = ["codex"];
standardL2.stages.find((stage) => stage.actor === "human-maintainer").actor = "codex";
expectFailure("advisory route actor", "must include human-maintainer", () => {
  validateReviewRoutePolicy(advisoryPolicy);
});

expectFailure("automatic mapping", "L3 automatic route must remain route-l3-standard", () => {
  const changed = structuredClone(policy);
  changed.nonNegotiablePolicy.automaticRouteByDepth.L3 = "route-l1-standard";
  validateReviewRoutePolicy(changed);
});

expectFailure("human requirement", "humanRequiredDepths must remain L1, L2, L3, L4", () => {
  const changed = structuredClone(policy);
  changed.nonNegotiablePolicy.humanRequiredDepths = ["L2", "L3", "L4"];
  validateReviewRoutePolicy(changed);
});

expectFailure("binding actor floor policy", "L4 actor floor must remain 1", () => {
  const changed = structuredClone(policy);
  changed.nonNegotiablePolicy.minimumDistinctBindingActors.L4 = 2;
  validateReviewRoutePolicy(changed);
});

console.log("✅ RRM-ROUTE-001 tests passed: provider-neutral routes stay deterministic, human maintainer authority is binding, and optional AI reviewers cannot satisfy a route.");
