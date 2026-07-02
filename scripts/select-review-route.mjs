import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DEPTHS = ["L1", "L2", "L3", "L4"];
const HEAD_PATTERN = /^[0-9a-f]{40}$/i;
const ACTOR_PATTERN = /^[A-Za-z0-9_.-]+$/;
const EXPECTED_AUTOMATIC_ROUTES = {
  L1: "route-l1-standard",
  L2: "route-l2-standard",
  L3: "route-l3-standard",
  L4: "route-l4-standard"
};

function fail(message) {
  throw new Error(`RRM-ROUTE-001: ${message}`);
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

function readJsonFile(filePath, label) {
  if (!filePath) fail(`missing ${label} path`);
  return readJson(readFileSync(filePath, "utf8"), label);
}

function unique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) fail(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function sameOrderedValues(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function validateReviewRoutePolicy(policy) {
  if (policy.contract !== "RRM-ROUTE-001") fail("unexpected contract");
  if (policy.version !== 1) fail("unsupported version");
  if (policy.authority !== "route-selection-only") fail("authority must remain route-selection-only");
  if (policy.routeKeyVersion !== 1) fail("routeKeyVersion must remain 1");
  if (!Array.isArray(policy.depthOrder) || !sameOrderedValues(policy.depthOrder, DEPTHS)) {
    fail("depthOrder must remain L1, L2, L3, L4");
  }
  if (!policy.overridePolicy?.enabled) fail("override policy must remain enabled and audited");
  if (!Number.isInteger(policy.overridePolicy.minimumReasonLength) || policy.overridePolicy.minimumReasonLength < 20) {
    fail("override minimumReasonLength must be at least 20");
  }
  const requiredOverrideFields = ["routeId", "expectedHead", "expectedDepth", "approvedBy", "reason"];
  if (!Array.isArray(policy.overridePolicy.requiredFields) || !sameOrderedValues(policy.overridePolicy.requiredFields, requiredOverrideFields)) {
    fail("override requiredFields changed");
  }

  const nonNegotiable = policy.nonNegotiablePolicy;
  if (!nonNegotiable || typeof nonNegotiable !== "object") fail("nonNegotiablePolicy is required");
  if (nonNegotiable.advisoryActorsForbidden !== true) fail("advisory actors must remain forbidden");
  if (nonNegotiable.exactDepthMatchRequired !== true) fail("exact depth matching must remain required");
  if (!Array.isArray(nonNegotiable.humanRequiredDepths)) fail("humanRequiredDepths are required");
  for (const depth of ["L3", "L4"]) {
    if (!nonNegotiable.humanRequiredDepths.includes(depth)) fail(`${depth} must require a human actor`);
  }

  if (!Array.isArray(policy.routes) || policy.routes.length === 0) fail("routes must not be empty");
  unique(policy.routes.map((route) => route.id), "route id");
  const routes = new Map(policy.routes.map((route) => [route.id, route]));

  for (const depth of DEPTHS) {
    const expectedRouteId = EXPECTED_AUTOMATIC_ROUTES[depth];
    if (nonNegotiable.automaticRouteByDepth?.[depth] !== expectedRouteId) {
      fail(`${depth} automatic route must remain ${expectedRouteId}`);
    }
    const floor = nonNegotiable.minimumDistinctBindingActors?.[depth];
    if (!Number.isInteger(floor) || floor < 1) fail(`${depth} has invalid actor floor`);
  }

  for (const route of policy.routes) {
    if (typeof route.id !== "string" || !route.id.trim()) fail("route has invalid id");
    if (!DEPTHS.includes(route.depth)) fail(`${route.id} uses unknown depth ${route.depth}`);
    if (!Number.isInteger(route.priority)) fail(`${route.id} has invalid priority`);
    if (typeof route.automatic !== "boolean") fail(`${route.id} has invalid automatic flag`);
    if (typeof route.governanceExceptionRequired !== "boolean") {
      fail(`${route.id} has invalid governanceExceptionRequired flag`);
    }
    if (!route.automatic && route.governanceExceptionRequired !== true) {
      fail(`${route.id} manual route must require a governance exception`);
    }
    if (typeof route.label !== "string" || !route.label.trim()) fail(`${route.id} has no label`);
    if (!Array.isArray(route.requiredActors) || route.requiredActors.length === 0) {
      fail(`${route.id} has no required actors`);
    }
    unique(route.requiredActors, `${route.id} actor`);
    for (const actor of route.requiredActors) {
      if (!ACTOR_PATTERN.test(actor) || actor === "system") fail(`${route.id} has invalid actor ${actor}`);
    }
    const actorFloor = nonNegotiable.minimumDistinctBindingActors[route.depth];
    if (new Set(route.requiredActors).size < actorFloor) {
      fail(`${route.id} has fewer than ${actorFloor} distinct binding actors`);
    }
    if (nonNegotiable.humanRequiredDepths.includes(route.depth) && !route.requiredActors.includes("human-maintainer")) {
      fail(`${route.id} must include human-maintainer`);
    }
    if (!Array.isArray(route.stages) || route.stages.length === 0) fail(`${route.id} has no stages`);
    unique(route.stages.map((stage) => stage.id), `${route.id} stage id`);
    const usedActors = new Set();
    for (const stage of route.stages) {
      if (typeof stage.id !== "string" || !stage.id.trim()) fail(`${route.id} has invalid stage id`);
      if (!["check", "review", "decision", "gate"].includes(stage.kind)) {
        fail(`${route.id}.${stage.id} has invalid kind ${stage.kind}`);
      }
      if (typeof stage.actor !== "string" || !stage.actor.trim()) fail(`${route.id}.${stage.id} has no actor`);
      if (stage.actor !== "system") {
        if (!route.requiredActors.includes(stage.actor)) {
          fail(`${route.id}.${stage.id} uses undeclared actor ${stage.actor}`);
        }
        usedActors.add(stage.actor);
        if (["review", "decision"].includes(stage.kind) && (!stage.role || typeof stage.role !== "string")) {
          fail(`${route.id}.${stage.id} is missing a role`);
        }
      }
    }
    for (const actor of route.requiredActors) {
      if (!usedActors.has(actor)) fail(`${route.id} declares unused actor ${actor}`);
    }
  }

  for (const [depth, routeId] of Object.entries(EXPECTED_AUTOMATIC_ROUTES)) {
    const route = routes.get(routeId);
    if (!route) fail(`missing automatic route ${routeId}`);
    if (!route.automatic || route.depth !== depth || route.governanceExceptionRequired) {
      fail(`${routeId} is not a valid automatic ${depth} route`);
    }
  }

  return routes;
}

function validateInputs(depthResult, rosterResult, head) {
  if (depthResult?.contract !== "RRM-DEPTH-001") fail("unexpected depth result");
  if (rosterResult?.contract !== "RRM-ROSTER-001") fail("unexpected roster result");
  if (!DEPTHS.includes(depthResult.depth)) fail(`unknown selected depth ${depthResult.depth}`);
  if (rosterResult.depth !== depthResult.depth) fail("depth and roster results disagree");
  if (!HEAD_PATTERN.test(head || "")) fail("head must be an exact 40-character SHA");
  if (!Array.isArray(rosterResult.reviewers)) fail("roster result has no reviewers");
}

function actorStateMap(rosterResult) {
  return new Map(rosterResult.reviewers.map((reviewer) => [reviewer.id, reviewer]));
}

function routeAvailability(route, actors) {
  const missingActors = [];
  const partialActors = [];
  const invalidAuthorityActors = [];
  const missingRoles = [];

  for (const actorId of route.requiredActors) {
    const actor = actors.get(actorId);
    if (!actor || actor.status !== "AVAILABLE" || actor.countsTowardBinding !== true) {
      missingActors.push(actorId);
      if (actor?.status === "PARTIAL") partialActors.push(actorId);
      continue;
    }
    if (actor.binding !== true || actor.advisory === true) invalidAuthorityActors.push(actorId);
    const requiredRoles = route.stages
      .filter((stage) => stage.actor === actorId && stage.role)
      .map((stage) => stage.role);
    for (const role of requiredRoles) {
      if (!Array.isArray(actor.roles) || !actor.roles.includes(role)) {
        missingRoles.push(`${actorId}:${role}`);
      }
    }
  }

  return {
    eligible: missingActors.length === 0 && invalidAuthorityActors.length === 0 && missingRoles.length === 0,
    missingActors,
    partialActors,
    invalidAuthorityActors,
    missingRoles
  };
}

function validateOverride(policy, override, route, depth, head) {
  if (!override || typeof override !== "object" || Array.isArray(override)) fail("override must be an object");
  for (const field of policy.overridePolicy.requiredFields) {
    if (typeof override[field] !== "string" || !override[field].trim()) fail(`override is missing ${field}`);
  }
  if (route.automatic) fail("override may select only a manual route");
  if (route.governanceExceptionRequired !== true) fail("override route lacks governance-exception binding");
  if (override.expectedDepth !== depth || route.depth !== depth) fail("override depth does not match selected depth");
  if (override.expectedHead.toLowerCase() !== head.toLowerCase()) fail("override head does not match current head");
  if (!ACTOR_PATTERN.test(override.approvedBy)) fail("override approvedBy is invalid");
  if (override.reason.trim().length < policy.overridePolicy.minimumReasonLength) {
    fail(`override reason must contain at least ${policy.overridePolicy.minimumReasonLength} characters`);
  }
}

function routeKey(policy, route) {
  return `rrm-route.v${policy.routeKeyVersion}:${route.depth}:${route.id}:${route.requiredActors.join(">")}`;
}

export function selectReviewRoute(policy, depthResult, rosterResult, head, override = null) {
  const routes = validateReviewRoutePolicy(policy);
  validateInputs(depthResult, rosterResult, head);
  const depth = depthResult.depth;
  const normalizedHead = head.toLowerCase();
  const actors = actorStateMap(rosterResult);

  let route;
  let selectionMode;
  let overrideAudit = null;
  if (override) {
    route = routes.get(override.routeId);
    if (!route) fail(`override references unknown route ${override.routeId}`);
    validateOverride(policy, override, route, depth, normalizedHead);
    selectionMode = "override";
    overrideAudit = {
      routeId: override.routeId,
      expectedHead: override.expectedHead.toLowerCase(),
      expectedDepth: override.expectedDepth,
      approvedBy: override.approvedBy,
      reason: override.reason.trim()
    };
  } else {
    route = routes.get(policy.nonNegotiablePolicy.automaticRouteByDepth[depth]);
    selectionMode = "automatic";
  }

  if (policy.nonNegotiablePolicy.exactDepthMatchRequired && route.depth !== depth) {
    fail(`${route.id} cannot serve selected depth ${depth}`);
  }

  const availability = routeAvailability(route, actors);
  const rosterReady = rosterResult.decision === "READY";
  if (!availability.eligible || !rosterReady) {
    const reasons = [...(rosterResult.reasons || [])];
    if (availability.missingActors.length) reasons.push(`MISSING_ROUTE_ACTORS_${availability.missingActors.join("_")}`);
    if (availability.partialActors.length) reasons.push(`PARTIAL_ROUTE_ACTORS_${availability.partialActors.join("_")}`);
    if (availability.invalidAuthorityActors.length) reasons.push(`INVALID_ROUTE_AUTHORITY_${availability.invalidAuthorityActors.join("_")}`);
    if (availability.missingRoles.length) reasons.push(`MISSING_ROUTE_ROLES_${availability.missingRoles.join("_")}`);
    return {
      contract: "RRM-ROUTE-001",
      policyVersion: policy.version,
      head: normalizedHead,
      depth,
      decision: "ESCALATE",
      authority: policy.authority,
      selectionMode,
      proposedRouteId: route.id,
      routeKey: null,
      reasons: [...new Set(reasons)],
      missingActors: availability.missingActors,
      partialActors: availability.partialActors,
      missingRoles: availability.missingRoles,
      availableBindingActors: rosterResult.availableBindingReviewers || [],
      overrideAudit,
      note: "Route selection is advisory to PDG and cannot authorize merge or any side effect."
    };
  }

  return {
    contract: "RRM-ROUTE-001",
    policyVersion: policy.version,
    head: normalizedHead,
    depth,
    decision: "SELECTED",
    authority: policy.authority,
    selectionMode,
    routeId: route.id,
    routeKey: routeKey(policy, route),
    label: route.label,
    governanceExceptionRequired: route.governanceExceptionRequired,
    actors: route.requiredActors,
    stages: route.stages,
    rationale: selectionMode === "automatic" ? `STANDARD_ROUTE_FOR_${depth}` : overrideAudit.reason,
    overrideAudit,
    note: "Route selection is advisory to PDG and cannot authorize merge or any side effect."
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const policyPath = args.get("--policy") || "qa/review-route-policy.json";
  const policy = readJsonFile(policyPath, policyPath);
  validateReviewRoutePolicy(policy);
  if (args.get("--validate-only")) {
    process.stdout.write(`${JSON.stringify({ contract: policy.contract, valid: true })}\n`);
    return;
  }

  const depthResult = args.get("--depth-json")
    ? readJson(args.get("--depth-json"), "depth result")
    : readJsonFile(args.get("--depth-result"), "depth result");
  const rosterResult = args.get("--roster-json")
    ? readJson(args.get("--roster-json"), "roster result")
    : readJsonFile(args.get("--roster-result"), "roster result");
  const head = args.get("--head") || process.env.REVIEW_HEAD;
  const overrideSource = args.get("--override-json") ?? process.env.REVIEW_ROUTE_OVERRIDE_JSON;
  const override = overrideSource ? readJson(overrideSource, "override") : null;
  const result = selectReviewRoute(policy, depthResult, rosterResult, head, override);
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
