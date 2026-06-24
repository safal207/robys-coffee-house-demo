import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { comparePublishedBytes } from "./integrity-byte-equivalence.mjs";

const workflow = readFileSync(".github/workflows/live-smoke.yml", "utf8");
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

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

assert(existsSync(".github/workflows/live-smoke.yml"), "workflow missing");
assert(workflow.includes("branches: [main]"), "main push trigger missing");
assert(workflow.includes("schedule:"), "schedule trigger missing");
assert(workflow.includes("playwright install --with-deps chromium"), "browser install missing");
assert(workflow.includes("ROBYS_LIVE_ATTEMPTS: 15"), "retry protection changed");
assert(workflow.includes("if: always()"), "failure evidence upload changed");

const landingBuild = buildMarker(landing, "landing");
const menuBuild = buildMarker(menu, "menu");
assert(
  landingBuild === menuBuild,
  `published pages must share one build marker: landing=${landingBuild}, menu=${menuBuild}`
);

const canonicalHtml = Buffer.from("<html>fixture</html>\n");
const canonicalEntry = {
  path: "menu.html",
  bytes: canonicalHtml.byteLength,
  sha256: sha256(canonicalHtml)
};
const exactComparison = comparePublishedBytes(canonicalHtml, canonicalEntry);
assert(exactComparison.passed && exactComparison.canonicalization === null, "exact integrity bytes must pass directly");

const hostNormalizedHtml = canonicalHtml.subarray(0, canonicalHtml.length - 1);
const normalizedComparison = comparePublishedBytes(hostNormalizedHtml, canonicalEntry);
assert(
  normalizedComparison.passed && normalizedComparison.canonicalization === "terminal_lf_restored",
  "one host-stripped terminal LF must be accepted only after digest restoration"
);

const nonHtmlEntry = { ...canonicalEntry, path: "app.js" };
assert(
  !comparePublishedBytes(hostNormalizedHtml, nonHtmlEntry).passed,
  "terminal LF equivalence must remain limited to HTML publication"
);
assert(
  !comparePublishedBytes(Buffer.from("<html>tampered</html>"), canonicalEntry).passed,
  "content changes must remain integrity failures"
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
console.log("✅ INTEGRITY-001 permits only a provable host-stripped terminal LF for HTML.");
console.log("✅ LIVE-001 workflow and smoke coverage are protected.");
