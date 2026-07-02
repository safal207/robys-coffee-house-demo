import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const GRAPH_PATH = process.argv[2] || "qa/proof-depth-graph.json";
const KIND_DEPTH = new Map([
  ["claim", 0],
  ["artifact", 1],
  ["executable-check", 2],
  ["mutation-challenge", 3],
  ["independent-review", 4],
  ["disposition", 5],
  ["decision", 6]
]);
const RELATIONS = new Set([
  "supported-by",
  "verified-by",
  "challenged-by",
  "reviewed-by",
  "resolved-by",
  "sealed-by",
  "advises"
]);

function fail(message) {
  throw new Error(`PDG-001: ${message}`);
}

function readGraph(relativePath) {
  if (path.isAbsolute(relativePath)) fail("graph path must be repository-relative");
  const absolutePath = path.resolve(ROOT, relativePath);
  const relative = path.relative(ROOT, absolutePath);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail("graph path escapes repository root");
  }
  if (!existsSync(absolutePath)) fail(`missing ${relativePath}`);
  try {
    return JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch (error) {
    fail(`${relativePath} is not valid JSON: ${error.message}`);
  }
}

function unique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) fail(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

const graph = readGraph(GRAPH_PATH);
if (graph.contract !== "PDG-001") fail("unexpected contract");
if (graph.version !== 1) fail("unsupported version");
if (!graph.policy || !Number.isInteger(graph.policy.minimumDecisionDepth)) fail("invalid policy");
if (graph.policy.minimumDecisionDepth !== 6) fail("minimumDecisionDepth must be 6");
if (graph.policy.minimumIndependentReviewers !== 2) {
  fail("minimumIndependentReviewers must be exactly 2");
}
if (graph.policy.bindingFreshness !== "exact-head") fail("bindingFreshness must be exact-head");
if (graph.policy.sealMustPostdateEvidence !== true) fail("sealMustPostdateEvidence must be true");
if (graph.policy.inferredEdgesAreAdvisoryOnly !== true) fail("inferredEdgesAreAdvisoryOnly must be true");
if (!Array.isArray(graph.policy.requiredKinds) || graph.policy.requiredKinds.length !== KIND_DEPTH.size) {
  fail("requiredKinds must declare every proof stage");
}
unique(graph.policy.requiredKinds, "required kind");
for (const kind of KIND_DEPTH.keys()) {
  if (!graph.policy.requiredKinds.includes(kind)) fail(`requiredKinds is missing ${kind}`);
}

if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) fail("nodes must not be empty");
if (!Array.isArray(graph.edges) || graph.edges.length === 0) fail("edges must not be empty");
unique(graph.nodes.map((node) => node.id), "node id");
const nodes = new Map(graph.nodes.map((node) => [node.id, node]));

for (const node of graph.nodes) {
  if (!/^([A-Z]+)-[A-Z0-9-]+$/.test(node.id || "")) fail(`invalid node id ${node.id}`);
  if (!KIND_DEPTH.has(node.kind)) fail(`${node.id} has invalid kind ${node.kind}`);
  if (node.depth !== KIND_DEPTH.get(node.kind)) fail(`${node.id} has invalid depth ${node.depth}`);
  if (!node.label || !["asserted", "observed", "inferred"].includes(node.origin)) {
    fail(`${node.id} is missing label or origin`);
  }
  if (["independent-review", "disposition", "decision"].includes(node.kind) && node.freshness !== "exact-head") {
    fail(`${node.id} must be exact-head bound`);
  }
  if (node.kind === "independent-review") {
    if (!node.provider || !node.independenceKey) fail(`${node.id} is missing reviewer independence metadata`);
  }
}

unique(graph.edges.map((edge) => `${edge.from}|${edge.to}|${edge.relation}`), "edge");
const outgoing = new Map(graph.nodes.map((node) => [node.id, []]));
const incoming = new Map(graph.nodes.map((node) => [node.id, []]));
const bindingOutgoing = new Map(graph.nodes.map((node) => [node.id, []]));
const bindingIncoming = new Map(graph.nodes.map((node) => [node.id, []]));
for (const edge of graph.edges) {
  const source = nodes.get(edge.from);
  const target = nodes.get(edge.to);
  if (!source || !target) fail(`edge references unknown node: ${edge.from} -> ${edge.to}`);
  if (edge.from === edge.to) fail(`self edge on ${edge.from}`);
  if (!RELATIONS.has(edge.relation)) fail(`invalid relation ${edge.relation}`);
  if (!["binding", "advisory"].includes(edge.authority)) fail(`invalid authority on ${edge.from} -> ${edge.to}`);
  if (target.depth !== source.depth + 1) fail(`proof stage skip: ${edge.from} -> ${edge.to}`);
  if ((source.origin === "inferred" || target.origin === "inferred") && edge.authority !== "advisory") {
    fail(`inferred knowledge cannot grant binding authority: ${edge.from} -> ${edge.to}`);
  }
  if (edge.relation === "sealed-by" && !(source.kind === "disposition" && target.kind === "decision")) {
    fail("sealed-by must connect disposition to decision");
  }
  outgoing.get(edge.from).push(edge);
  incoming.get(edge.to).push(edge);
  if (edge.authority === "binding") {
    bindingOutgoing.get(edge.from).push(edge);
    bindingIncoming.get(edge.to).push(edge);
  }
}

const visiting = new Set();
const visited = new Set();
function visit(nodeId) {
  if (visiting.has(nodeId)) fail(`cycle detected at ${nodeId}`);
  if (visited.has(nodeId)) return;
  visiting.add(nodeId);
  for (const edge of outgoing.get(nodeId)) visit(edge.to);
  visiting.delete(nodeId);
  visited.add(nodeId);
}
for (const nodeId of nodes.keys()) visit(nodeId);

const claims = graph.nodes.filter((node) => node.kind === "claim");
const decisions = graph.nodes.filter((node) => node.kind === "decision");
if (claims.length === 0 || decisions.length === 0) fail("graph requires at least one claim and one decision");

function descendants(startId, edgesBySource = bindingOutgoing) {
  const seen = new Set([startId]);
  const queue = [startId];
  while (queue.length) {
    const current = queue.shift();
    for (const edge of edgesBySource.get(current)) {
      if (!seen.has(edge.to)) {
        seen.add(edge.to);
        queue.push(edge.to);
      }
    }
  }
  return seen;
}

function ancestors(startId, edgesByTarget = bindingIncoming) {
  const seen = new Set([startId]);
  const queue = [startId];
  while (queue.length) {
    const current = queue.shift();
    for (const edge of edgesByTarget.get(current)) {
      if (!seen.has(edge.from)) {
        seen.add(edge.from);
        queue.push(edge.from);
      }
    }
  }
  return seen;
}

for (const claim of claims) {
  const reachable = descendants(claim.id);
  const reachableKinds = new Set([...reachable].map((id) => nodes.get(id).kind));
  for (const kind of graph.policy.requiredKinds) {
    if (!reachableKinds.has(kind)) fail(`${claim.id} lacks binding proof stage ${kind}`);
  }
  if (!decisions.some((decision) => reachable.has(decision.id))) fail(`${claim.id} cannot reach a binding decision`);
  const reviewers = graph.nodes.filter((node) => reachable.has(node.id) && node.kind === "independent-review");
  const independence = new Set(reviewers.map((node) => node.independenceKey));
  if (independence.size < graph.policy.minimumIndependentReviewers) {
    fail(`${claim.id} has only ${independence.size} independent reviewers on binding paths`);
  }
}

for (const decision of decisions) {
  if (decision.depth < graph.policy.minimumDecisionDepth) fail(`${decision.id} is too shallow`);
  const evidence = ancestors(decision.id);
  for (const claim of claims) {
    if (!evidence.has(claim.id)) fail(`${decision.id} is not binding-backed by ${claim.id}`);
  }
  if (!bindingIncoming.get(decision.id).some((edge) => edge.relation === "sealed-by")) {
    fail(`${decision.id} has no binding proof seal`);
  }
}

for (const node of graph.nodes) {
  const fromClaim = claims.some((claim) => descendants(claim.id).has(node.id));
  const toDecision = decisions.some((decision) => ancestors(decision.id).has(node.id));
  if (!fromClaim || !toDecision) fail(`${node.id} is outside a complete binding proof path`);
}

console.log(`✅ PDG-001 valid: ${graph.nodes.length} nodes, ${graph.edges.length} edges, depth D${graph.policy.minimumDecisionDepth}, ${graph.policy.minimumIndependentReviewers} independent reviewers on binding paths.`);
