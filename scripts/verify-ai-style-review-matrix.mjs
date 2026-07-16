import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const verifierModule = require("./verify-ai-review-contract.cjs");
const selectRequiredEvidence = verifierModule?._test?.selectRequiredEvidence;
const activeProviderNames = verifierModule?._test?.ACTIVE_PROVIDER_NAMES;
const dormantProviderNames = verifierModule?._test?.DORMANT_PROVIDER_NAMES;
const matrix = JSON.parse(readFileSync("qa/ai-style-review-matrix.json", "utf8"));
const uiUx = JSON.parse(readFileSync("qa/ui-ux-matrix.json", "utf8"));
const visual = JSON.parse(readFileSync("qa/visual-regression.json", "utf8"));
const dashboard = JSON.parse(readFileSync("qa/regression-dashboard.json", "utf8"));
const workflow = readFileSync(".github/workflows/visual-regression.yml", "utf8");
const aiWorkflow = readFileSync(".github/workflows/ai-review-contract.yml", "utf8");
const uiRunner = readFileSync("scripts/ui-ux-matrix.mjs", "utf8");
const socialVerifier = readFileSync("scripts/verify-social-network-live.mjs", "utf8");
const indexHtml = readFileSync("index.html", "utf8");
const menuHtml = readFileSync("menu.html", "utf8");
const discoverHtml = readFileSync("discover.html", "utf8");
const socialSource = readFileSync("src/social-offer.ts", "utf8");

const requiredLenses = ["max", "qwen", "grok", "manus", "gemini", "gpt", "claude"];
const expectedCoverage = new Set(matrix.requiredCoverage ?? []);
const results = [];
const canonicalInstagramLiteral = /["']https:\/\/www\.instagram\.com\/robyscoffeehouse\/["']/;

function fail(message) {
  throw new Error(`[AI-STYLE-001] ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function record(id, checks) {
  for (const [label, condition] of checks) assert(condition, `${id}: ${label}`);
  results.push({ id, passed: true, checks: checks.length });
}

function languageSet(html) {
  return new Set(Array.from(html.matchAll(/data-lang=["'](tr|en|ru)["']/gi), (match) => match[1].toLowerCase()));
}

function hasLanguages(html) {
  const languages = languageSet(html);
  return ["tr", "en", "ru"].every((language) => languages.has(language));
}

function hasCanonicalInstagramLiteral(content) {
  return canonicalInstagramLiteral.test(content);
}

function reviewerFailoverIsCurrentHeadBound() {
  if (typeof selectRequiredEvidence !== "function") return false;
  if (JSON.stringify(activeProviderNames) !== JSON.stringify(["Qodo", "Codex"])) return false;
  if (dormantProviderNames?.has("CodeRabbit") !== true) return false;

  const head = "a".repeat(40);
  const staleHead = "b".repeat(40);
  const anchor = Date.parse("2026-07-16T00:00:00Z");
  const at = (minutes) => new Date(anchor + minutes * 60_000).toISOString();
  const request = (command, minutes) => ({
    body: `${command}\n\nExact head: ${head}`,
    created_at: at(minutes),
    author_association: "OWNER"
  });
  const qodoSignal = (type = "Bot") => ({
    body: "Review limit reached. Next review available in: 28 minutes.",
    created_at: at(3),
    updated_at: at(3),
    user: { login: "qodo-code-review[bot]", type }
  });
  const rabbitSignal = () => ({
    body: "Review limit reached. Next review available in: 28 minutes.",
    created_at: at(3),
    updated_at: at(3),
    user: { login: "coderabbitai[bot]", type: "Bot" }
  });
  const codexReview = (commitId = head) => ({
    submitted_at: at(4),
    state: "COMMENTED",
    commit_id: commitId,
    user: { login: "chatgpt-codex-connector[bot]", type: "Bot" }
  });
  const rabbitReview = () => ({
    submitted_at: at(4),
    state: "APPROVED",
    commit_id: head,
    user: { login: "coderabbitai[bot]", type: "Bot" }
  });
  const baseComments = [
    request("/qodo review", 1),
    request("@codex review", 2)
  ];
  const select = (comments, reviews) => selectRequiredEvidence({
    comments,
    reviews,
    currentHead: head,
    headUpdateAnchor: anchor,
    now: anchor + 5 * 60_000
  });

  const valid = select([...baseComments, qodoSignal()], [codexReview()]);
  const missingStandby = select([request("/qodo review", 1), qodoSignal()], [codexReview()]);
  const stale = select([...baseComments, qodoSignal()], [codexReview(staleHead)]);
  const spoofed = select([...baseComments, qodoSignal("User")], [codexReview()]);
  const noticeOnly = select([...baseComments, qodoSignal()], []);
  const dormantRabbit = select(
    [...baseComments, request("@coderabbitai review", 2), rabbitSignal()],
    [rabbitReview()]
  );

  return valid.provider === "Codex" &&
    valid.mode === "automatic-failover" &&
    valid.primaryFailure === "PROVIDER_LIMIT" &&
    valid.unavailableProviders?.includes("Qodo") &&
    valid.warmStandbyRoundReady === true &&
    missingStandby.provider === null &&
    missingStandby.mode === "pending" &&
    missingStandby.fallbackEligible === false &&
    missingStandby.warmStandbyRoundReady === false &&
    stale.provider === null &&
    stale.mode === "fallback-pending" &&
    spoofed.provider === null &&
    spoofed.mode === "pending" &&
    noticeOnly.provider === null &&
    noticeOnly.mode === "fallback-pending" &&
    dormantRabbit.provider === null &&
    dormantRabbit.mode === "pending" &&
    dormantRabbit.unavailableProviders?.length === 0;
}

assert(matrix.version === 1, "matrix version must remain 1");
assert(matrix.contract === "AI-STYLE-001", "contract id changed");
assert(Array.isArray(matrix.lenses), "lenses must be an array");
assert(matrix.lenses.length === requiredLenses.length, `expected ${requiredLenses.length} lenses, found ${matrix.lenses.length}`);

const lensIds = matrix.lenses.map((lens) => lens.id);
assert(new Set(lensIds).size === lensIds.length, "lens ids must be unique");
assert(requiredLenses.every((id) => lensIds.includes(id)), `missing required lens: ${requiredLenses.filter((id) => !lensIds.includes(id)).join(", ")}`);

const observedCoverage = new Set();
for (const lens of matrix.lenses) {
  assert(typeof lens.label === "string" && lens.label.trim().length >= 8, `${lens.id} label is incomplete`);
  assert(typeof lens.mission === "string" && lens.mission.trim().length >= 30, `${lens.id} mission is incomplete`);
  assert(Array.isArray(lens.coverage) && lens.coverage.length >= 3, `${lens.id} must cover at least three areas`);
  assert(Array.isArray(lens.assertions) && lens.assertions.length >= 5, `${lens.id} must define at least five assertions`);
  assert(new Set(lens.assertions).size === lens.assertions.length, `${lens.id} contains duplicate assertions`);
  lens.coverage.forEach((area) => observedCoverage.add(area));
}
assert([...expectedCoverage].every((area) => observedCoverage.has(area)), `coverage is incomplete: ${[...expectedCoverage].filter((area) => !observedCoverage.has(area)).join(", ")}`);

const uiRoutes = new Map(uiUx.routes.map((route) => [route.id, route]));
const visualIds = new Set(visual.captures.map((item) => item.id));

record("max", [
  ["UI/UX retries are bounded to two attempts", uiUx.maxAttempts === 2 && workflow.includes("UI_UX_ATTEMPTS: 2")],
  ["visual failures receive one explicit recheck", workflow.includes("Recheck failed screenshot comparison")],
  ["scroll failures receive one explicit recheck", workflow.includes("Recheck failed mobile scroll audit")],
  ["confirmed UI/UX failures remain hard failures", uiRunner.includes("if (failures.length) throw new Error")],
  ["integrity remains a gated regression contract", dashboard.contracts.some((contract) => contract.id === "INTEGRITY-001" && contract.status === "gated")]
]);

record("qwen", [
  ["compact phone matrix includes 320, 360, 390 and 412 widths", [320, 360, 390, 412].every((width) => uiUx.profiles.some((profile) => profile.width === width))],
  ["landing exposes TR, EN and RU", hasLanguages(indexHtml)],
  ["menu exposes TR, EN and RU", hasLanguages(menuHtml)],
  ["Taste Journey exposes TR, EN and RU", hasLanguages(discoverHtml)],
  ["invalid matrix profile and retry settings fail fast", uiRunner.includes("Unknown profile") && uiRunner.includes("Invalid UI_UX_ATTEMPTS")]
]);

record("grok", [
  ["Instagram extraction includes protocol and www variants", socialVerifier.includes("https?:\\/\\/(?:www\\.)?instagram\\.com")],
  ["noncanonical profile destinations fail", socialVerifier.includes("normalize(reference.value) !== canonical")],
  ["unsafe output directories are rejected", uiRunner.includes("Refusing to delete unsafe results directory") && socialVerifier.includes("Refusing to write outside visual-results")],
  ["overflow, duplicate ids and broken images are hard assertions", uiRunner.includes("horizontal overflow") && uiRunner.includes("duplicate ids") && uiRunner.includes("broken images")],
  ["pairing rotation is exercised repeatedly", uiRunner.includes("rotation collapsed after discovery")]
]);

record("manus", [
  ["landing, menu and discover routes exist", ["landing", "menu", "discover"].every((id) => uiRoutes.has(id))],
  ["every route has a deterministic ready selector", [...uiRoutes.values()].every((route) => typeof route.ready === "string" && (route.ready.startsWith(".") || route.ready.startsWith("#")))],
  ["menu end-to-end behavior is exercised", uiRunner.includes("exerciseMenu") && uiRunner.includes("clearing search did not restore all items")],
  ["Taste Journey end-to-end behavior is exercised", uiRunner.includes("exerciseDiscover") && uiRunner.includes("another-pairing action did not change the pairing")],
  ["machine-readable scenario evidence is written", uiRunner.includes('writeFileSync(path.join(resultsDir, "summary.json")')]
]);

record("gemini", [
  ["full-page captures cover all three customer routes", ["landing-full", "menu-full", "discover-full"].every((id) => visualIds.has(id))],
  ["social offer has a dedicated capture", visualIds.has("social-offer")],
  ["menu sharing has a dedicated capture", visualIds.has("menu-share")],
  ["Taste Journey pairing has a dedicated capture", visualIds.has("discover-pairing")],
  ["visual matrix covers phone, tablet, laptop and desktop", [320, 768, 1366, 1440].every((width) => visual.viewports.some((viewport) => viewport.width === width))]
]);

record("gpt", [
  ["canonical Instagram profile exists in landing", hasCanonicalInstagramLiteral(indexHtml)],
  ["canonical Instagram profile exists in menu", hasCanonicalInstagramLiteral(menuHtml)],
  ["canonical Instagram profile exists in typed social source", hasCanonicalInstagramLiteral(socialSource)],
  ["menu route renders a substantial product set before filtering", uiRunner.includes("initialCount > 10")],
  ["changed UI styles use content-revisioned URLs", /social-offer\.css\?v=[0-9a-f]{12}/i.test(indexHtml) && /discover\.css\?v=[0-9a-f]{12}/i.test(discoverHtml)]
]);

record("claude", [
  ["keyboard focus requires a focus-specific visual change", uiRunner.includes("focusVisible && focused.cueChanged")],
  ["primary controls require accessible names", uiRunner.includes("has no accessible name")],
  ["external social links require safe rel tokens", uiRunner.includes('rel.includes("noopener")') && uiRunner.includes('rel.includes("noreferrer")')],
  ["network evidence persists sanitized outcomes only", socialVerifier.includes("persistedAttempts") && socialVerifier.includes("network-error")],
  ["AI evidence is exact-head bound, requires Qodo-Codex dispatch before failover, and ignores dormant CodeRabbit", aiWorkflow.includes("verify-ai-review-contract.cjs") && reviewerFailoverIsCurrentHeadBound()]
]);

const report = {
  generatedAt: new Date().toISOString(),
  contract: matrix.contract,
  lenses: results,
  coverage: [...observedCoverage].sort(),
  uiUxScenarios: uiUx.profiles.length * uiUx.routes.length,
  visualCaptures: visual.captures.reduce((total, item) => total + item.viewports.length, 0)
};

const outputValue = process.env.AI_STYLE_RESULTS_DIR?.trim();
if (outputValue) {
  const outputDir = path.resolve(outputValue);
  const relative = path.relative(process.cwd(), outputDir);
  assert(relative === "visual-results" || relative.startsWith(`visual-results${path.sep}`), `refusing to write outside visual-results: ${outputDir}`);
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(path.join(outputDir, "summary.json"), `${JSON.stringify(report, null, 2)}\n`);
}

for (const result of results) {
  console.log(`✅ AI-STYLE-001 ${result.id}: ${result.checks} checks passed`);
}
console.log(`✅ AI-STYLE-001 passed ${results.length} review lenses across ${observedCoverage.size} coverage areas.`);
