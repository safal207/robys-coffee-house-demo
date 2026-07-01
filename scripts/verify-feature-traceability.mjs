import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MANIFEST_PATH = "qa/feature-traceability-matrix.json";
const NON_FILE_EVIDENCE = [
  "external:", "pr:", "commit:", "build:", "cache:",
  "branch:", "defect:", "matrix:", "manual:"
];

function fail(message) {
  throw new Error(`TRACE-001: ${message}`);
}

function readJson(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
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

function parseTransition(value, featureId) {
  const match = /^(.+?) --(.+?)--> (.+)$/.exec(value);
  if (!match) fail(`${featureId} has invalid transition: ${value}`);
  return { from: match[1], event: match[2], to: match[3] };
}

function parseEvidence(value) {
  if (NON_FILE_EVIDENCE.some((prefix) => value.startsWith(prefix))) return null;
  const marker = value.indexOf("#");
  if (marker < 0) return { file: value, fragment: null };
  return { file: value.slice(0, marker), fragment: value.slice(marker + 1) };
}

function fragmentToken(fragment) {
  if (fragment.startsWith(".")) return fragment.slice(1);
  if (fragment.startsWith("#")) return fragment.slice(1);
  if (fragment.startsWith("[") && fragment.endsWith("]")) {
    return fragment.slice(1, -1).split("=")[0];
  }
  return fragment;
}

function getAtPath(value, dottedPath) {
  return dottedPath.split(".").reduce((current, key) => current?.[key], value);
}

const manifest = readJson(MANIFEST_PATH);
if (manifest.contract !== "TRACE-001") fail("unexpected contract");
if (manifest.version !== 1) fail("unsupported version");
if (!Array.isArray(manifest.scope?.layers) || manifest.scope.layers.length === 0) {
  fail("scope.layers must not be empty");
}
unique(manifest.scope.layers, "scope layer");
if (!Array.isArray(manifest.featureFiles) || manifest.featureFiles.length === 0) {
  fail("featureFiles must not be empty");
}

unique(manifest.featureFiles, "feature file");
if (!Array.isArray(manifest.milestones) || manifest.milestones.length === 0) {
  fail("milestones must not be empty");
}
unique(manifest.milestones.map((item) => item.id), "milestone id");

const sortedMilestones = [...manifest.milestones].sort((left, right) => left.at.localeCompare(right.at));
if (JSON.stringify(sortedMilestones) !== JSON.stringify(manifest.milestones)) {
  fail("milestones must be ordered by date");
}

const features = manifest.featureFiles.flatMap((file) => {
  const document = readJson(file);
  if (!Array.isArray(document.features) || document.features.length === 0) {
    fail(`${file} must contain a non-empty features array`);
  }
  return document.features;
});

unique(features.map((feature) => feature.id), "feature id");
const featureIds = new Set(features.map((feature) => feature.id));
const requirementIds = [];

for (const milestone of manifest.milestones) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(milestone.at)) fail(`${milestone.id} has invalid date`);
  if (!milestone.ref || !milestone.change) fail(`${milestone.id} is incomplete`);
  if (!Array.isArray(milestone.features) || milestone.features.length === 0) {
    fail(`${milestone.id} has no feature references`);
  }
  for (const featureId of milestone.features) {
    if (!featureIds.has(featureId)) fail(`${milestone.id} references unknown ${featureId}`);
  }
}

for (const feature of features) {
  if (!/^FEAT-(UI|API|PLATFORM|QA|BE)-\d{3}$/.test(feature.id)) {
    fail(`invalid feature id ${feature.id}`);
  }
  if (!feature.name || !feature.domain || !feature.owner) fail(`${feature.id} is missing identity fields`);

  if (!manifest.allowed.lifecycle.includes(feature.current?.lifecycle)) {
    fail(`${feature.id} has invalid lifecycle ${feature.current?.lifecycle}`);
  }
  if (!manifest.allowed.operational.includes(feature.current?.operational)) {
    fail(`${feature.id} has invalid operational state ${feature.current?.operational}`);
  }

  const layerKeys = manifest.scope.layers;
  if (!feature.layers || JSON.stringify(Object.keys(feature.layers).sort()) !== JSON.stringify([...layerKeys].sort())) {
    fail(`${feature.id} must declare ${layerKeys.join(", ")}`);
  }
  for (const layer of layerKeys) {
    if (!manifest.allowed.layer.includes(feature.layers[layer])) {
      fail(`${feature.id} has invalid ${layer} status ${feature.layers[layer]}`);
    }
  }

  if (!Array.isArray(feature.requirements) || feature.requirements.length === 0) {
    fail(`${feature.id} has no requirements`);
  }
  for (const requirement of feature.requirements) {
    const match = /^(REQ-[A-Z]+-\d{3}-\d{2})\s+/.exec(requirement);
    if (!match) fail(`${feature.id} has invalid requirement: ${requirement}`);
    requirementIds.push(match[1]);
  }

  const model = feature.stateModel;
  if (!model || !Array.isArray(model.states) || model.states.length < 2) {
    fail(`${feature.id} has an incomplete state model`);
  }
  unique(model.states, `${feature.id} state`);
  const stateSet = new Set(model.states);
  if (!stateSet.has(model.initial)) fail(`${feature.id} initial state is not declared`);
  if (!Array.isArray(model.transitions) || model.transitions.length === 0) {
    fail(`${feature.id} has no transitions`);
  }
  const transitions = model.transitions.map((transitionText) => {
    const transition = parseTransition(transitionText, feature.id);
    if (!stateSet.has(transition.from) || !stateSet.has(transition.to)) {
      fail(`${feature.id} transition references an unknown state: ${transitionText}`);
    }
    return transition;
  });
  const reachable = new Set([model.initial]);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const transition of transitions) {
      if (reachable.has(transition.from) && !reachable.has(transition.to)) {
        reachable.add(transition.to);
        expanded = true;
      }
    }
  }
  const unreachable = model.states.filter((state) => !reachable.has(state));
  if (unreachable.length) fail(`${feature.id} has unreachable states: ${unreachable.join(", ")}`);

  if (!Array.isArray(feature.history) || feature.history.length === 0) fail(`${feature.id} has no history`);
  let previousDate = "";
  for (const entry of feature.history) {
    if (!Array.isArray(entry) || entry.length !== 3) fail(`${feature.id} has invalid history entry`);
    const [date, lifecycle, ref] = entry;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(`${feature.id} has invalid history date ${date}`);
    if (date < previousDate) fail(`${feature.id} history is not ordered`);
    if (!manifest.allowed.lifecycle.includes(lifecycle)) fail(`${feature.id} history has invalid lifecycle`);
    if (!ref) fail(`${feature.id} history is missing a reference`);
    previousDate = date;
  }
  if (feature.history.at(-1)[1] !== feature.current.lifecycle) {
    fail(`${feature.id} current lifecycle does not match latest history`);
  }

  if (!Array.isArray(feature.evidence) || feature.evidence.length === 0) fail(`${feature.id} has no evidence`);
  for (const evidence of feature.evidence) {
    if (typeof evidence !== "string" || !evidence) fail(`${feature.id} has invalid evidence`);
    const parsed = parseEvidence(evidence);
    if (!parsed) continue;
    if (!parsed.file) fail(`${feature.id} has invalid evidence file: ${evidence}`);
    const absolutePath = path.join(ROOT, parsed.file);
    if (!existsSync(absolutePath)) fail(`${feature.id} evidence file does not exist: ${parsed.file}`);
    if (parsed.fragment) {
      const token = fragmentToken(parsed.fragment).trim();
      const contents = readFileSync(absolutePath, "utf8");
      if (!token || !contents.includes(token)) {
        fail(`${feature.id} evidence fragment does not exist: ${evidence}`);
      }
    }
  }

  if (!Array.isArray(feature.tests) || feature.tests.length === 0) fail(`${feature.id} has no tests`);
  if (!Array.isArray(feature.risks) || feature.risks.length === 0) fail(`${feature.id} has no risks`);
  if (!feature.nextGate) fail(`${feature.id} has no next gate`);

  if (feature.dependsOn !== undefined && !Array.isArray(feature.dependsOn)) {
    fail(`${feature.id} has invalid dependsOn`);
  }
  for (const dependency of feature.dependsOn || []) {
    if (!featureIds.has(dependency)) fail(`${feature.id} depends on unknown ${dependency}`);
    if (dependency === feature.id) fail(`${feature.id} cannot depend on itself`);
  }
}

unique(requirementIds, "requirement id");

if (!Array.isArray(manifest.invariants)) fail("invariants must be an array");
for (const invariant of manifest.invariants) {
  if (!invariant?.path || typeof invariant.min !== "number" || !invariant.message) {
    fail("invalid manifest invariant");
  }
  const matches = features.filter((feature) => getAtPath(feature, invariant.path) === invariant.equals).length;
  if (matches < invariant.min) fail(invariant.message);
}

const counts = features.reduce((result, feature) => {
  result[feature.current.lifecycle] = (result[feature.current.lifecycle] || 0) + 1;
  return result;
}, {});

console.log(`✅ TRACE-001 valid: ${features.length} features, ${requirementIds.length} requirements, ${manifest.milestones.length} milestones.`);
console.log(`Lifecycle summary: ${Object.entries(counts).map(([state, count]) => `${state}=${count}`).join(", ")}`);
