import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const MANIFEST_PATH = "qa/feature-traceability-matrix.json";
const NON_FILE_EVIDENCE = [
  "external:", "pr:", "commit:", "build:", "cache:",
  "branch:", "defect:", "matrix:", "manual:"
];
const HTML_EXTENSIONS = new Set([".html", ".htm"]);
const SCRIPT_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"]);
const RAW_TEXT_TAGS = new Set(["script", "style", "template", "textarea"]);

function fail(message) {
  throw new Error(`TRACE-001: ${message}`);
}

function readJson(relativePath) {
  const absolutePath = path.resolve(ROOT, relativePath);
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function exactTokenExists(contents, token) {
  const escaped = escapeRegExp(token);
  return new RegExp(`(^|[^A-Za-z0-9_$-])${escaped}([^A-Za-z0-9_$-]|$)`, "m").test(contents);
}

function findTagEnd(contents, start) {
  let quote = null;
  for (let index = start + 1; index < contents.length; index += 1) {
    const character = contents[index];
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === ">") return index;
  }
  return -1;
}

function stripNonDomHtml(contents) {
  const lower = contents.toLowerCase();
  let result = "";
  let cursor = 0;

  while (cursor < contents.length) {
    if (lower.startsWith("<!--", cursor)) {
      const end = lower.indexOf("-->", cursor + 4);
      cursor = end < 0 ? contents.length : end + 3;
      continue;
    }

    if (contents[cursor] === "<") {
      const opening = /^<([A-Za-z][A-Za-z0-9:-]*)\b/.exec(contents.slice(cursor));
      const tagName = opening?.[1]?.toLowerCase();
      if (tagName && RAW_TEXT_TAGS.has(tagName)) {
        const openingEnd = findTagEnd(contents, cursor);
        if (openingEnd < 0) return result;
        const closingStart = lower.indexOf(`</${tagName}`, openingEnd + 1);
        if (closingStart < 0) return result;
        const closingEnd = findTagEnd(contents, closingStart);
        cursor = closingEnd < 0 ? contents.length : closingEnd + 1;
        continue;
      }
    }

    result += contents[cursor];
    cursor += 1;
  }

  return result;
}

function extractStartTags(contents) {
  const tags = [];
  for (let cursor = 0; cursor < contents.length; cursor += 1) {
    if (contents[cursor] !== "<" || contents[cursor + 1] === "/") continue;
    if (!/[A-Za-z]/.test(contents[cursor + 1] || "")) continue;
    const end = findTagEnd(contents, cursor);
    if (end < 0) break;
    tags.push(contents.slice(cursor, end + 1));
    cursor = end;
  }
  return tags;
}

function parseAttributes(tag) {
  const attributes = [];
  let cursor = 1;
  while (cursor < tag.length && /[A-Za-z0-9:-]/.test(tag[cursor])) cursor += 1;

  while (cursor < tag.length) {
    while (/\s/.test(tag[cursor] || "")) cursor += 1;
    if (!tag[cursor] || tag[cursor] === ">" || tag[cursor] === "/") break;

    const nameStart = cursor;
    while (tag[cursor] && !/[\s=/>]/.test(tag[cursor])) cursor += 1;
    const name = tag.slice(nameStart, cursor).toLowerCase();
    if (!name) break;

    while (/\s/.test(tag[cursor] || "")) cursor += 1;
    let value;
    if (tag[cursor] === "=") {
      cursor += 1;
      while (/\s/.test(tag[cursor] || "")) cursor += 1;
      if (tag[cursor] === '"' || tag[cursor] === "'") {
        const quote = tag[cursor];
        cursor += 1;
        const valueStart = cursor;
        while (tag[cursor] && tag[cursor] !== quote) cursor += 1;
        value = tag.slice(valueStart, cursor);
        if (tag[cursor] === quote) cursor += 1;
      } else {
        const valueStart = cursor;
        while (tag[cursor] && !/[\s>]/.test(tag[cursor])) cursor += 1;
        value = tag.slice(valueStart, cursor).replace(/\/$/, "");
      }
    }
    attributes.push({ name, value });
  }

  return attributes;
}

function parseAttributeFragment(fragment) {
  const match = /^\[\s*([^\s~|^$*=\]]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\s*\]$/.exec(fragment);
  if (!match) return null;
  return { name: match[1].toLowerCase(), value: match[2] ?? match[3] ?? match[4] };
}

function htmlFragmentExists(contents, fragment) {
  const attributes = extractStartTags(stripNonDomHtml(contents)).flatMap(parseAttributes);

  if (fragment.startsWith("[") && fragment.endsWith("]")) {
    const expected = parseAttributeFragment(fragment);
    if (!expected) return false;
    return attributes.some((attribute) => (
      attribute.name === expected.name &&
      (expected.value === undefined || attribute.value === expected.value)
    ));
  }

  if (fragment.startsWith(".")) {
    const className = fragment.slice(1);
    return Boolean(className) && attributes.some((attribute) => (
      attribute.name === "class" &&
      typeof attribute.value === "string" &&
      attribute.value.split(/\s+/).includes(className)
    ));
  }

  const id = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  return Boolean(id) && attributes.some((attribute) => attribute.name === "id" && attribute.value === id);
}

function sourceAttributeFragmentExists(contents, fragment) {
  const expected = parseAttributeFragment(fragment);
  if (!expected) return false;
  const attribute = escapeRegExp(expected.name);
  if (expected.value === undefined) {
    return new RegExp(`(^|[^A-Za-z0-9_:-])${attribute}(?=\\s*=|\\s|>|/|$)`, "m").test(contents);
  }
  const value = escapeRegExp(expected.value);
  return new RegExp(
    `(^|[^A-Za-z0-9_:-])${attribute}\\s*=\\s*(?:"${value}"|'${value}'|${value}(?=\\s|>|/|$))`,
    "m"
  ).test(contents);
}

function stripSourceComments(contents, extension) {
  if (extension === ".css") return contents.replace(/\/\*[\s\S]*?\*\//g, "");
  if (SCRIPT_EXTENSIONS.has(extension)) {
    return contents
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  }
  return contents;
}

function selectorTokenExists(contents, prefix, token) {
  const escaped = escapeRegExp(token);
  return new RegExp(`${escapeRegExp(prefix)}${escaped}(?![A-Za-z0-9_-])`, "m").test(contents);
}

function fragmentExists(contents, fragment, file) {
  const extension = path.extname(file).toLowerCase();
  if (HTML_EXTENSIONS.has(extension)) return htmlFragmentExists(contents, fragment);

  const searchable = stripSourceComments(contents, extension);
  if (fragment.startsWith("[") && fragment.endsWith("]")) {
    return sourceAttributeFragmentExists(searchable, fragment);
  }
  if (fragment.startsWith(".")) {
    const className = fragment.slice(1);
    return Boolean(className) && selectorTokenExists(searchable, ".", className);
  }
  if (fragment.startsWith("#")) {
    const id = fragment.slice(1);
    return Boolean(id) && selectorTokenExists(searchable, "#", id);
  }
  return exactTokenExists(searchable, fragment);
}

function resolveEvidencePath(file, featureId) {
  if (path.isAbsolute(file)) fail(`${featureId} evidence path must be repository-relative: ${file}`);
  const absolutePath = path.resolve(ROOT, file);
  const relativePath = path.relative(ROOT, absolutePath);
  if (relativePath === ".." || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    fail(`${featureId} evidence escapes repository root: ${file}`);
  }
  return absolutePath;
}

function getAtPath(value, dottedPath) {
  return dottedPath.split(".").reduce((current, key) => current?.[key], value);
}

const manifest = readJson(MANIFEST_PATH);
if (manifest.contract !== "TRACE-001") fail("unexpected contract");
if (manifest.version !== 1) fail("unsupported version");
if (!Array.isArray(manifest.scope?.layers) || manifest.scope.layers.length === 0) fail("scope.layers must not be empty");
unique(manifest.scope.layers, "scope layer");
if (!Array.isArray(manifest.featureFiles) || manifest.featureFiles.length === 0) fail("featureFiles must not be empty");
unique(manifest.featureFiles, "feature file");
if (!Array.isArray(manifest.milestones) || manifest.milestones.length === 0) fail("milestones must not be empty");
unique(manifest.milestones.map((item) => item.id), "milestone id");

const sortedMilestones = [...manifest.milestones].sort((left, right) => left.at.localeCompare(right.at));
if (JSON.stringify(sortedMilestones) !== JSON.stringify(manifest.milestones)) fail("milestones must be ordered by date");

const features = manifest.featureFiles.flatMap((file) => {
  const document = readJson(file);
  if (!Array.isArray(document.features) || document.features.length === 0) fail(`${file} must contain a non-empty features array`);
  return document.features;
});

unique(features.map((feature) => feature.id), "feature id");
const featureIds = new Set(features.map((feature) => feature.id));
const featureById = new Map(features.map((feature) => [feature.id, feature]));
const requirementIds = [];

for (const milestone of manifest.milestones) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(milestone.at)) fail(`${milestone.id} has invalid date`);
  if (!milestone.ref || !milestone.change) fail(`${milestone.id} is incomplete`);
  if (!Array.isArray(milestone.features) || milestone.features.length === 0) fail(`${milestone.id} has no feature references`);
  for (const featureId of milestone.features) {
    if (!featureIds.has(featureId)) fail(`${milestone.id} references unknown ${featureId}`);
  }
}

for (const feature of features) {
  if (!/^FEAT-(UI|API|PLATFORM|QA|BE)-\d{3}$/.test(feature.id)) fail(`invalid feature id ${feature.id}`);
  if (!feature.name || !feature.domain || !feature.owner) fail(`${feature.id} is missing identity fields`);
  if (!manifest.allowed.lifecycle.includes(feature.current?.lifecycle)) fail(`${feature.id} has invalid lifecycle ${feature.current?.lifecycle}`);
  if (!manifest.allowed.operational.includes(feature.current?.operational)) fail(`${feature.id} has invalid operational state ${feature.current?.operational}`);

  const layerKeys = manifest.scope.layers;
  if (!feature.layers || JSON.stringify(Object.keys(feature.layers).sort()) !== JSON.stringify([...layerKeys].sort())) {
    fail(`${feature.id} must declare ${layerKeys.join(", ")}`);
  }
  for (const layer of layerKeys) {
    if (!manifest.allowed.layer.includes(feature.layers[layer])) fail(`${feature.id} has invalid ${layer} status ${feature.layers[layer]}`);
  }

  if (!Array.isArray(feature.requirements) || feature.requirements.length === 0) fail(`${feature.id} has no requirements`);
  for (const requirement of feature.requirements) {
    const match = /^(REQ-[A-Z]+-\d{3}-\d{2})\s+/.exec(requirement);
    if (!match) fail(`${feature.id} has invalid requirement: ${requirement}`);
    requirementIds.push(match[1]);
  }

  const model = feature.stateModel;
  if (!model || !Array.isArray(model.states) || model.states.length < 2) fail(`${feature.id} has an incomplete state model`);
  unique(model.states, `${feature.id} state`);
  const stateSet = new Set(model.states);
  if (!stateSet.has(model.initial)) fail(`${feature.id} initial state is not declared`);
  if (!Array.isArray(model.transitions) || model.transitions.length === 0) fail(`${feature.id} has no transitions`);
  const transitions = model.transitions.map((text) => {
    const transition = parseTransition(text, feature.id);
    if (!stateSet.has(transition.from) || !stateSet.has(transition.to)) {
      fail(`${feature.id} transition references an unknown state: ${text}`);
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
  if (feature.history.at(-1)[1] !== feature.current.lifecycle) fail(`${feature.id} current lifecycle does not match latest history`);

  if (!Array.isArray(feature.evidence) || feature.evidence.length === 0) fail(`${feature.id} has no evidence`);
  for (const evidence of feature.evidence) {
    if (typeof evidence !== "string" || !evidence) fail(`${feature.id} has invalid evidence`);
    const parsed = parseEvidence(evidence);
    if (!parsed) continue;
    if (!parsed.file) fail(`${feature.id} has invalid evidence file: ${evidence}`);
    const absolutePath = resolveEvidencePath(parsed.file, feature.id);
    if (!existsSync(absolutePath)) fail(`${feature.id} evidence file does not exist: ${parsed.file}`);
    if (parsed.fragment) {
      const contents = readFileSync(absolutePath, "utf8");
      if (!fragmentExists(contents, parsed.fragment, parsed.file)) {
        fail(`${feature.id} evidence fragment does not exist: ${evidence}`);
      }
    }
  }

  if (!Array.isArray(feature.tests) || feature.tests.length === 0) fail(`${feature.id} has no tests`);
  if (!Array.isArray(feature.risks) || feature.risks.length === 0) fail(`${feature.id} has no risks`);
  if (!feature.nextGate) fail(`${feature.id} has no next gate`);
  if (feature.dependsOn !== undefined && !Array.isArray(feature.dependsOn)) fail(`${feature.id} has invalid dependsOn`);
  for (const dependency of feature.dependsOn || []) {
    if (!featureIds.has(dependency)) fail(`${feature.id} depends on unknown ${dependency}`);
    if (dependency === feature.id) fail(`${feature.id} cannot depend on itself`);
  }
}

const visiting = new Set();
const visited = new Set();
function visitDependency(featureId, trail) {
  if (visiting.has(featureId)) {
    const cycleStart = trail.indexOf(featureId);
    fail(`feature dependency cycle: ${[...trail.slice(cycleStart), featureId].join(" -> ")}`);
  }
  if (visited.has(featureId)) return;
  visiting.add(featureId);
  const nextTrail = [...trail, featureId];
  for (const dependency of featureById.get(featureId).dependsOn || []) visitDependency(dependency, nextTrail);
  visiting.delete(featureId);
  visited.add(featureId);
}
for (const featureId of featureIds) visitDependency(featureId, []);

unique(requirementIds, "requirement id");
if (!Array.isArray(manifest.invariants)) fail("invariants must be an array");
for (const invariant of manifest.invariants) {
  if (
    !invariant?.path ||
    !Object.hasOwn(invariant, "equals") ||
    !Number.isInteger(invariant.min) ||
    invariant.min <= 0 ||
    typeof invariant.message !== "string" ||
    !invariant.message.trim()
  ) fail("invalid manifest invariant");
  const matches = features.filter((feature) => getAtPath(feature, invariant.path) === invariant.equals).length;
  if (matches < invariant.min) fail(invariant.message);
}

const counts = features.reduce((result, feature) => {
  result[feature.current.lifecycle] = (result[feature.current.lifecycle] || 0) + 1;
  return result;
}, {});

console.log(`✅ TRACE-001 valid: ${features.length} features, ${requirementIds.length} requirements, ${manifest.milestones.length} milestones.`);
console.log(`Lifecycle summary: ${Object.entries(counts).map(([state, count]) => `${state}=${count}`).join(", ")}`);
