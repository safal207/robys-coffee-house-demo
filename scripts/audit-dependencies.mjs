import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize, relative, resolve, sep } from "node:path";

const ROOT = process.cwd();
const REPORT_DIR = join(ROOT, ".artifacts");
const REPORT_PATH = join(REPORT_DIR, "dependency-graph.json");
const CHECK_MODE = process.argv.includes("--check");
const IGNORED_DIRECTORIES = new Set([".git", "node_modules", ".artifacts", "dist", "coverage"]);
const TRAVERSABLE_EXTENSIONS = new Set([".html", ".htm", ".css", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".json", ".webmanifest"]);
const RUNTIME_EXTENSIONS = new Set([".css", ".js", ".mjs", ".cjs"]);
const RESOLUTION_EXTENSIONS = ["", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".css", ".json", ".webmanifest", ".html"];
const BUILD_INPUT_OWNERSHIP = [
  { output: "menu-runtime.js", inputs: ["menu-runtime-entry.js"] },
  { output: "discover-runtime.js", inputs: ["discover-runtime-entry.js"] },
  { output: "menu-runtime.css", inputs: ["menu.css", "pairing-posters.css"] }
];

function toRepoPath(path) {
  return relative(ROOT, path).split(sep).join("/");
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) return [];
    const absolute = join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [toRepoPath(absolute)];
  });
}

const allFiles = walk(ROOT).sort();
const fileSet = new Set(allFiles);
const topLevelDirectories = new Set(
  readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !IGNORED_DIRECTORIES.has(entry.name))
    .map((entry) => entry.name)
);

function isExternal(reference) {
  return /^(?:[a-z]+:)?\/\//i.test(reference) || /^(?:data|mailto|tel|javascript):/i.test(reference) || reference.startsWith("#");
}

function stripDecorators(reference) {
  return reference.trim().replace(/^['"]|['"]$/g, "").split("#", 1)[0].split("?", 1)[0].trim();
}

function candidatePaths(source, reference) {
  const cleaned = stripDecorators(reference);
  if (!cleaned || isExternal(cleaned) || cleaned.includes("${")) return [];

  const sourceDirectory = dirname(source);
  const bases = [];
  if (cleaned.startsWith("/")) {
    bases.push(cleaned.slice(1));
  } else {
    const firstSegment = cleaned.split("/", 1)[0];
    if (topLevelDirectories.has(firstSegment) || fileSet.has(cleaned)) bases.push(cleaned);
    bases.push(normalize(join(sourceDirectory, cleaned)).split(sep).join("/"));
  }

  const resolved = [];
  for (const base of [...new Set(bases)]) {
    for (const extension of RESOLUTION_EXTENSIONS) {
      const candidate = `${base}${extension}`.replace(/^\.\//, "");
      if (fileSet.has(candidate)) resolved.push(candidate);
    }
    for (const indexName of ["index.js", "index.ts", "index.mjs", "index.css", "index.html"]) {
      const candidate = join(base, indexName).split(sep).join("/");
      if (fileSet.has(candidate)) resolved.push(candidate);
    }
  }
  return [...new Set(resolved)];
}

function looksLikeLocalPath(value) {
  const cleaned = stripDecorators(value);
  if (!cleaned || isExternal(cleaned)) return false;
  return /(?:^|\/)[^/]+\.(?:css|js|mjs|cjs|ts|tsx|json|webmanifest|html?|svg|png|jpe?g|webp|gif|avif|mp4|webm|woff2?|ttf|ico)$/i.test(cleaned);
}

function literalReferences(content) {
  const references = [];
  const patterns = [
    /\b(?:import|export)\s+(?:[^'";]+?\s+from\s+)?["']([^"']+)["']/g,
    /\b(?:import|require|fetch)\s*\(\s*["']([^"']+)["']/g,
    /\b(?:register|Worker|SharedWorker)\s*\(\s*["']([^"']+)["']/g,
    /\b(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi,
    /@import\s+(?:url\()?\s*["']?([^"')\s;]+)["']?\s*\)?/gi,
    /url\(\s*["']?([^"')]+)["']?\s*\)/gi,
    /["']([^"'\n]+)["']/g
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      if (looksLikeLocalPath(match[1])) references.push(match[1]);
    }
  }
  return [...new Set(references)];
}

function templateReferences(content) {
  const templates = [];
  for (const match of content.matchAll(/`([^`]*\$\{[^`]+)`/g)) {
    const raw = match[1];
    const withoutQuery = raw.split("?", 1)[0];
    if (/\.(?:css|js|mjs|cjs)(?:$|[^a-z0-9])/i.test(withoutQuery)) templates.push(raw);
  }
  return [...new Set(templates)];
}

function templateMatches(source, template) {
  const cleaned = stripDecorators(template);
  const staticPattern = cleaned
    .split(/\$\{[^}]+\}/g)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[^/]+");

  const candidates = [];
  const sourceDirectory = dirname(source);
  const firstSegment = cleaned.split("/", 1)[0];
  const prefixes = topLevelDirectories.has(firstSegment)
    ? [""]
    : [sourceDirectory === "." ? "" : `${sourceDirectory}/`, ""];

  for (const prefix of prefixes) {
    const regex = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${staticPattern}$`);
    candidates.push(...allFiles.filter((path) => regex.test(path)));
  }
  return [...new Set(candidates)];
}

const htmlRoots = allFiles.filter((path) => /\.html?$/i.test(path));
const buildRoots = ["src/app.ts"].filter((path) => fileSet.has(path));
const roots = [...new Set([...htmlRoots, ...buildRoots])];
const reachable = new Set();
const edges = [];
const unresolved = [];
const suspicious = [];
const suspiciousMatches = new Set();
const queue = [...roots];

function traverseQueue() {
  while (queue.length) {
    const source = queue.shift();
    if (!source || reachable.has(source) || !fileSet.has(source)) continue;
    reachable.add(source);

    const extension = extname(source).toLowerCase();
    if (!TRAVERSABLE_EXTENSIONS.has(extension)) continue;

    let content;
    try {
      content = readFileSync(join(ROOT, source), "utf8");
    } catch {
      continue;
    }

    for (const reference of literalReferences(content)) {
      const targets = candidatePaths(source, reference);
      if (!targets.length) {
        unresolved.push({ source, reference });
        continue;
      }
      for (const target of targets) {
        edges.push({ source, target, kind: "literal", reference });
        if (!reachable.has(target)) queue.push(target);
      }
    }

    for (const template of templateReferences(content)) {
      const matches = templateMatches(source, template);
      matches.forEach((path) => suspiciousMatches.add(path));
      suspicious.push({ source, template, matches });
    }
  }
}

traverseQueue();

const buildOwnershipErrors = [];
const activeBuildOwnership = [];
for (const ownership of BUILD_INPUT_OWNERSHIP) {
  if (!fileSet.has(ownership.output)) {
    buildOwnershipErrors.push(`missing output: ${ownership.output}`);
    continue;
  }

  const missingInputs = ownership.inputs.filter((input) => !fileSet.has(input));
  if (missingInputs.length) {
    buildOwnershipErrors.push(`${ownership.output} missing inputs: ${missingInputs.join(", ")}`);
    continue;
  }

  // Inputs are owned only while their built output is already reachable from a
  // runtime root. This preserves fail-closed detection for abandoned outputs.
  if (!reachable.has(ownership.output)) continue;

  activeBuildOwnership.push(ownership);
  for (const input of ownership.inputs) {
    edges.push({ source: ownership.output, target: input, kind: "build-input", reference: input });
    if (!reachable.has(input)) queue.push(input);
  }
}

traverseQueue();

function isRuntimeCandidate(path) {
  if (!RUNTIME_EXTENSIONS.has(extname(path).toLowerCase())) return false;
  if (path.startsWith("scripts/") || path.startsWith(".github/") || path.startsWith("lighthouse/") || path.startsWith("tests/") || path.startsWith("test/") || path.startsWith("e2e/")) return false;
  if (/(?:^|\/)[^/]+\.config\.(?:js|mjs|cjs)$/i.test(path)) return false;
  return true;
}

const runtimeCandidates = allFiles.filter(isRuntimeCandidate);
const reachableRuntime = runtimeCandidates.filter((path) => reachable.has(path));
const suspiciousRuntime = runtimeCandidates.filter((path) => suspiciousMatches.has(path) && !reachable.has(path));
const provenOrphans = runtimeCandidates.filter((path) => !reachable.has(path) && !suspiciousMatches.has(path));

const report = {
  generatedAt: new Date().toISOString(),
  roots,
  counts: {
    allFiles: allFiles.length,
    runtimeCandidates: runtimeCandidates.length,
    reachableFiles: reachable.size,
    reachableRuntime: reachableRuntime.length,
    suspiciousRuntime: suspiciousRuntime.length,
    provenOrphans: provenOrphans.length,
    buildOwnershipErrors: buildOwnershipErrors.length,
    unresolvedLiteralReferences: unresolved.length,
    suspiciousReferences: suspicious.length
  },
  activeBuildOwnership,
  buildOwnershipErrors,
  reachableRuntime,
  suspiciousRuntime,
  provenOrphans,
  suspiciousReferences: suspicious,
  unresolvedLiteralReferences: unresolved,
  edges
};

mkdirSync(REPORT_DIR, { recursive: true });
writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Dependency graph roots: ${roots.join(", ") || "none"}`);
console.log(`Runtime CSS/JS: ${runtimeCandidates.length}`);
console.log(`Reachable runtime: ${reachableRuntime.length}`);
console.log(`Suspicious runtime: ${suspiciousRuntime.length}`);
console.log(`Proven orphan runtime: ${provenOrphans.length}`);
if (buildOwnershipErrors.length) console.log(`BUILD_OWNERSHIP_ERRORS\n${buildOwnershipErrors.join("\n")}`);
if (provenOrphans.length) console.log(`PROVEN_ORPHANS\n${provenOrphans.join("\n")}`);
if (suspicious.length) console.log(`SUSPICIOUS_REFERENCES\n${suspicious.map(({ source, template, matches }) => `${source}: ${template} -> ${matches.join(", ") || "no current matches"}`).join("\n")}`);
if (unresolved.length) console.log(`UNRESOLVED_LITERAL_REFERENCES\n${unresolved.map(({ source, reference }) => `${source}: ${reference}`).join("\n")}`);
console.log(`Report: ${toRepoPath(REPORT_PATH)}`);

if (CHECK_MODE && (provenOrphans.length || buildOwnershipErrors.length)) process.exitCode = 1;
