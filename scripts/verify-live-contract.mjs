import { existsSync, readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/live-smoke.yml", "utf8");
const integrityWorkflow = readFileSync(".github/workflows/live-integrity.yml", "utf8");
const refreshWorkflow = readFileSync(".github/workflows/refresh-integrity.yml", "utf8");
const runner = readFileSync("scripts/live-smoke.mjs", "utf8");
const landing = readFileSync("index.html", "utf8");
const menu = readFileSync("menu.html", "utf8");
const dashboard = JSON.parse(readFileSync("qa/regression-dashboard.json", "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(`[LIVE-001] ${message}`);
}

function buildMarker(html, pageName) {
  const value = html.match(/<meta\b[^>]*name=["']robys-build["'][^>]*content=["']([^"']+)["']/i)?.[1];
  assert(value, `${pageName} robys-build marker missing`);
  return value;
}

assert(existsSync(".github/workflows/live-smoke.yml"), "workflow missing");
assert(workflow.includes("branches: [main]"), "main push trigger missing");
assert(workflow.includes("schedule:"), "schedule trigger missing");
assert(workflow.includes("npm install --no-save --package-lock=false playwright@1.52.0"), "browser tooling install missing");
assert(workflow.includes("google-chrome --version"), "codec-capable Chrome preflight missing");
assert(workflow.includes("ROBYS_LIVE_ATTEMPTS: 4"), "bounded retry policy changed");
assert(workflow.includes("ROBYS_LIVE_DELAY_MS: 5000"), "bounded retry delay changed");
assert(workflow.includes("ROBYS_LIVE_FETCH_TIMEOUT_MS: 15000"), "fetch deadline changed");
assert(workflow.includes("ROBYS_LIVE_VIDEO_TIMEOUT_MS: 8000"), "video observation deadline changed");
assert(workflow.includes("ROBYS_LIVE_BROWSER_CHANNEL: chrome"), "Chrome channel binding missing");
assert(workflow.includes("if: always()"), "failure evidence upload changed");
assert(workflow.includes("if-no-files-found: error"), "missing live evidence must fail the workflow");

assert(refreshWorkflow.includes('- "menu.html"'), "menu changes must refresh the integrity manifest");
assert(
  refreshWorkflow.includes("Verify refreshed public digests"),
  "manifest refresh must own final public digest verification"
);
assert(
  refreshWorkflow.includes("remote_menu_sha") && refreshWorkflow.includes("local_menu_sha"),
  "refresh publication wait must bind to the exact menu digest"
);
assert(
  integrityWorkflow.includes("INTEGRITY_REFRESH_REQUIRED"),
  "pre-refresh content pushes must delegate instead of producing false failures"
);
assert(
  integrityWorkflow.includes("refresh-integrity owns final public verification"),
  "delegation ownership message missing"
);

const landingBuild = buildMarker(landing, "landing");
const menuBuild = buildMarker(menu, "menu");
assert(
  landingBuild === menuBuild,
  `published pages must share one build marker: landing=${landingBuild}, menu=${menuBuild}`
);

for (const marker of ["robys-build", "robots.txt", "sitemap.xml", ".hero-video", ".mobile-cta", ".map-live-frame", ".full-menu-item", "#menu-search", "Lotus", "Escape"]) {
  assert(runner.includes(marker), `runner check missing: ${marker}`);
}

const contract = dashboard.contracts?.find((item) => item.id === "LIVE-001");
assert(contract?.status === "gated", "dashboard contract missing or disabled");
assert(contract?.severity === "P0", "severity changed");
assert(contract?.owner === "QA", "owner changed");
assert(contract?.evidence === "post-merge Chromium + HTTP", "evidence changed");
assert(contract?.assertions?.length >= 8, "assertions incomplete");

console.log(`✅ LIVE-001 build markers match: ${landingBuild}.`);
console.log("✅ INTEGRITY-001 delegates pre-refresh pushes and verifies after refreshed publication.");
console.log("✅ LIVE-001 bounded Chrome workflow and smoke coverage are protected.");
