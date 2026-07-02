import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const MANIFEST_PATH = "qa/feature-traceability-matrix.json";
const NON_FILE_EVIDENCE = [
  "external:", "pr:", "commit:", "build:", "cache:",
  "branch:", "defect:", "matrix:", "manual:"
];
const SCRIPT_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"]);

function fail(message) {
  throw new Error(`TRACE-SOURCE-001: ${message}`);
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

function parseEvidence(value) {
  if (NON_FILE_EVIDENCE.some((prefix) => value.startsWith(prefix))) return null;
  const marker = value.indexOf("#");
  if (marker < 0) return { file: value, fragment: null };
  return { file: value.slice(0, marker), fragment: value.slice(marker + 1) };
}

function resolveRepositoryPath(file) {
  if (path.isAbsolute(file)) fail(`evidence path must be repository-relative: ${file}`);
  const absolutePath = path.resolve(ROOT, file);
  const relativePath = path.relative(ROOT, absolutePath);
  if (relativePath === ".." || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    fail(`evidence path escapes repository root: ${file}`);
  }
  return absolutePath;
}

function stripScriptComments(contents) {
  let result = "";
  let state = "code";

  for (let index = 0; index < contents.length; index += 1) {
    const current = contents[index];
    const next = contents[index + 1];

    if (state === "line-comment") {
      if (current === "\n") {
        result += current;
        state = "code";
      } else {
        result += " ";
      }
      continue;
    }

    if (state === "block-comment") {
      if (current === "*" && next === "/") {
        result += "  ";
        index += 1;
        state = "code";
      } else {
        result += current === "\n" ? "\n" : " ";
      }
      continue;
    }

    if (["single", "double", "template"].includes(state)) {
      result += current;
      if (current === "\\" && next !== undefined) {
        result += next;
        index += 1;
        continue;
      }
      if (
        (state === "single" && current === "'") ||
        (state === "double" && current === '"') ||
        (state === "template" && current === "`")
      ) state = "code";
      continue;
    }

    if (current === "/" && next === "/") {
      result += "  ";
      index += 1;
      state = "line-comment";
      continue;
    }
    if (current === "/" && next === "*") {
      result += "  ";
      index += 1;
      state = "block-comment";
      continue;
    }
    if (current === "'") state = "single";
    else if (current === '"') state = "double";
    else if (current === "`") state = "template";
    result += current;
  }

  return result;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function exactTokenExists(contents, token) {
  const escaped = escapeRegExp(token);
  return new RegExp(`(^|[^A-Za-z0-9_$-])${escaped}([^A-Za-z0-9_$-]|$)`, "m").test(contents);
}

function fragmentExists(contents, fragment) {
  if (!fragment) return false;
  if (fragment.startsWith("[") && fragment.endsWith("]")) {
    const selector = fragment.slice(1, -1).trim();
    return selector.length > 0 && contents.includes(selector);
  }
  if (fragment.startsWith(".") || fragment.startsWith("#")) {
    const prefix = fragment[0];
    const token = fragment.slice(1);
    return Boolean(token) && new RegExp(`${escapeRegExp(prefix)}${escapeRegExp(token)}(?![A-Za-z0-9_-])`, "m").test(contents);
  }
  return exactTokenExists(contents, fragment);
}

const manifest = readJson(MANIFEST_PATH);
if (!Array.isArray(manifest.featureFiles) || manifest.featureFiles.length === 0) {
  fail("featureFiles must not be empty");
}

let checked = 0;
for (const featureFile of manifest.featureFiles) {
  const document = readJson(featureFile);
  for (const feature of document.features || []) {
    for (const evidence of feature.evidence || []) {
      if (typeof evidence !== "string") continue;
      const parsed = parseEvidence(evidence);
      if (parsed === null || parsed.fragment === null) continue;
      if (!parsed.file) fail(`${feature.id} has invalid evidence file: ${evidence}`);
      if (parsed.fragment === "") fail(`${feature.id} has empty evidence fragment: ${evidence}`);
      if (!SCRIPT_EXTENSIONS.has(path.extname(parsed.file).toLowerCase())) continue;
      const absolutePath = resolveRepositoryPath(parsed.file);
      if (!existsSync(absolutePath)) fail(`${feature.id} evidence file does not exist: ${parsed.file}`);
      const searchable = stripScriptComments(readFileSync(absolutePath, "utf8"));
      if (!fragmentExists(searchable, parsed.fragment)) {
        fail(`${feature.id} source evidence fragment does not exist outside comments: ${evidence}`);
      }
      checked += 1;
    }
  }
}

console.log(`✅ TRACE-SOURCE-001 valid: ${checked} script evidence fragment(s) matched outside line and block comments.`);
