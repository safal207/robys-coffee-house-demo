import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const REQUIRED_LEVELS = ["L1", "L2", "L3", "L4"];
const REQUIRED_FLOORS = {
  "documentation-only": "L1",
  "product-runtime": "L2",
  "workflow-governance": "L3",
  "deploy-sensitive": "L4",
  fallback: "L3"
};

function fail(message) {
  throw new Error(`RRM-DEPTH-001: ${message}`);
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

function validatePolicy(policy) {
  if (policy.contract !== "RRM-DEPTH-001") fail("unexpected contract");
  if (policy.version !== 1) fail("unsupported version");
  if (!Array.isArray(policy.levels) || policy.levels.length !== REQUIRED_LEVELS.length) {
    fail("levels must define L1 through L4");
  }

  unique(policy.levels.map((level) => level.id), "level id");
  const levelMap = new Map(policy.levels.map((level) => [level.id, level]));
  for (const [index, id] of REQUIRED_LEVELS.entries()) {
    const level = levelMap.get(id);
    if (!level) fail(`missing level ${id}`);
    if (level.rank !== index + 1) fail(`${id} rank must be ${index + 1}`);
    if (!Number.isInteger(level.minimumBindingReviewers) || level.minimumBindingReviewers < 1) {
      fail(`${id} has invalid minimumBindingReviewers`);
    }
    if (typeof level.label !== "string" || !level.label.trim()) fail(`${id} has no label`);
  }
  if (policy.defaultLevel !== "L3") fail("defaultLevel must fail closed to L3");

  if (!policy.nonNegotiableFloors || typeof policy.nonNegotiableFloors !== "object") {
    fail("nonNegotiableFloors are required");
  }
  if (!Array.isArray(policy.pathRules) || policy.pathRules.length === 0) fail("pathRules must not be empty");
  unique(policy.pathRules.map((rule) => rule.id), "path rule id");
  const ruleMap = new Map(policy.pathRules.map((rule) => [rule.id, rule]));

  for (const rule of policy.pathRules) {
    if (!levelMap.has(rule.level)) fail(`${rule.id} references unknown level ${rule.level}`);
    if (!Number.isInteger(rule.priority)) fail(`${rule.id} has invalid priority`);
    if (typeof rule.reason !== "string" || !rule.reason.trim()) fail(`${rule.id} has no reason`);
    if (!Array.isArray(rule.patterns) || rule.patterns.length === 0) fail(`${rule.id} has no patterns`);
    for (const pattern of rule.patterns) {
      if (typeof pattern !== "string" || !pattern) fail(`${rule.id} has an invalid pattern`);
      try {
        new RegExp(pattern, "i");
      } catch (error) {
        fail(`${rule.id} has invalid regex ${pattern}: ${error.message}`);
      }
    }
  }

  for (const [ruleId, floorId] of Object.entries(REQUIRED_FLOORS)) {
    if (policy.nonNegotiableFloors[ruleId] !== floorId) {
      fail(`non-negotiable floor ${ruleId} must remain ${floorId}`);
    }
    const rule = ruleMap.get(ruleId);
    if (!rule) fail(`missing non-negotiable rule ${ruleId}`);
    if (levelMap.get(rule.level).rank < levelMap.get(floorId).rank) {
      fail(`non-negotiable floor ${ruleId} cannot be lower than ${floorId}`);
    }
  }
  const fallback = ruleMap.get("fallback");
  if (!fallback.patterns.includes(".*")) fail("fallback must match every unknown path");

  if (!Array.isArray(policy.allowedSignalValues) || policy.allowedSignalValues.length === 0) {
    fail("allowedSignalValues must not be empty");
  }
  unique(policy.allowedSignalValues, "signal value");
  if (!policy.signalFloors || typeof policy.signalFloors !== "object") fail("signalFloors are required");
  for (const [signal, floors] of Object.entries(policy.signalFloors)) {
    if (!floors || typeof floors !== "object" || Array.isArray(floors)) fail(`${signal} has invalid floors`);
    for (const [value, levelId] of Object.entries(floors)) {
      if (!policy.allowedSignalValues.includes(value)) fail(`${signal} uses unknown value ${value}`);
      if (!levelMap.has(levelId)) fail(`${signal}.${value} uses unknown level ${levelId}`);
    }
  }

  return { levelMap };
}

function normalizeFiles(files) {
  if (!Array.isArray(files) || files.length === 0) fail("changed files must be a non-empty array");
  return files.map((file) => {
    if (typeof file !== "string" || !file.trim()) fail("changed files contain an invalid path");
    const normalized = file.replaceAll("\\", "/").replace(/^\.\//, "");
    if (path.posix.isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) {
      fail(`changed file escapes repository root: ${file}`);
    }
    return normalized;
  });
}

export function evaluateReviewDepth(policy, files, signals = {}) {
  const { levelMap } = validatePolicy(policy);
  const normalizedFiles = normalizeFiles(files);
  if (!signals || typeof signals !== "object" || Array.isArray(signals)) fail("signals must be an object");

  let selected = levelMap.get("L1");
  const matchedRules = [];
  for (const file of normalizedFiles) {
    const matches = policy.pathRules.filter((rule) => rule.patterns.some((pattern) => new RegExp(pattern, "i").test(file)));
    const specificMatches = matches.filter((rule) => rule.id !== "fallback");
    const candidates = specificMatches.length > 0 ? specificMatches : matches.filter((rule) => rule.id === "fallback");
    if (candidates.length === 0) fail(`no path rule matched ${file}`);
    const strongest = candidates.sort((left, right) => {
      const rankDifference = levelMap.get(right.level).rank - levelMap.get(left.level).rank;
      return rankDifference || right.priority - left.priority || left.id.localeCompare(right.id);
    })[0];
    matchedRules.push({ file, ruleId: strongest.id, level: strongest.level, reason: strongest.reason });
    if (levelMap.get(strongest.level).rank > selected.rank) selected = levelMap.get(strongest.level);
  }

  const signalReasons = [];
  for (const [signal, value] of Object.entries(signals)) {
    if (!(signal in policy.signalFloors)) fail(`unknown signal ${signal}`);
    if (!policy.allowedSignalValues.includes(value)) fail(`${signal} has invalid value ${value}`);
    const floorId = policy.signalFloors[signal][value];
    if (!floorId) continue;
    const floor = levelMap.get(floorId);
    signalReasons.push({ signal, value, level: floorId });
    if (floor.rank > selected.rank) selected = floor;
  }

  return {
    contract: "RRM-DEPTH-001",
    policyVersion: policy.version,
    depth: selected.id,
    rank: selected.rank,
    label: selected.label,
    minimumBindingReviewers: selected.minimumBindingReviewers,
    files: normalizedFiles,
    signals,
    matchedRules,
    signalReasons,
    decisionBasis: signalReasons.length > 0 ? "path-and-signal-floor" : "path-floor"
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const policyPath = args.get("--policy") || "qa/review-depth-policy.json";
  const policy = readJson(readFileSync(policyPath, "utf8"), policyPath);
  validatePolicy(policy);
  if (args.get("--validate-only")) {
    process.stdout.write(`${JSON.stringify({ contract: policy.contract, valid: true })}\n`);
    return;
  }

  const filesSource = args.get("--files-json") ?? process.env.REVIEW_CHANGED_FILES_JSON;
  if (!filesSource) fail("provide --files-json or REVIEW_CHANGED_FILES_JSON");
  const signalsSource = args.get("--signals-json") ?? process.env.REVIEW_DEPTH_SIGNALS_JSON ?? "{}";
  const result = evaluateReviewDepth(
    policy,
    readJson(filesSource, "changed files"),
    readJson(signalsSource, "signals")
  );
  const rendered = `${JSON.stringify(result, null, 2)}\n`;
  const outputPath = args.get("--output");
  if (outputPath) writeFileSync(outputPath, rendered);
  process.stdout.write(rendered);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
