import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const MANIFEST_PATH = "qa/feature-traceability-matrix.json";
const NON_FILE_EVIDENCE = [
  "external:", "pr:", "commit:", "build:", "cache:",
  "branch:", "defect:", "matrix:", "manual:"
];
const HTML_EXTENSIONS = new Set([".html", ".htm"]);
const RAW_TEXT_TAGS = new Set(["script", "style", "template", "textarea"]);

function fail(message) {
  throw new Error(`TRACE-HTML-001: ${message}`);
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
      const commentEnd = lower.indexOf("-->", cursor + 4);
      cursor = commentEnd < 0 ? contents.length : commentEnd + 3;
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
  const sanitized = stripNonDomHtml(contents);
  const attributes = extractStartTags(sanitized).flatMap(parseAttributes);

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
      if (!parsed?.fragment || !HTML_EXTENSIONS.has(path.extname(parsed.file).toLowerCase())) continue;
      const absolutePath = resolveRepositoryPath(parsed.file);
      if (!existsSync(absolutePath)) fail(`${feature.id} evidence file does not exist: ${parsed.file}`);
      const contents = readFileSync(absolutePath, "utf8");
      if (!htmlFragmentExists(contents, parsed.fragment)) {
        fail(`${feature.id} HTML evidence fragment does not exist in real markup: ${evidence}`);
      }
      checked += 1;
    }
  }
}

console.log(`✅ TRACE-HTML-001 valid: ${checked} HTML evidence fragment(s) matched real start-tag attributes.`);
